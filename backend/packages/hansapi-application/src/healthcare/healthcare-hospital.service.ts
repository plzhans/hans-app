import { Injectable } from '@nestjs/common';
import { Page } from '@hansapi/common';
import { PrismaService } from '@hansapi/data';
import { HOSPITAL_TIERS, INPATIENT_TIERS } from '@hansapi/data/seed';

import { asString } from '../common/coerce';
import { stationName } from './station';

import { Prisma } from '@prisma/client';

import {
  HospitalDetail,
  HospitalSearchCommand,
  HospitalSummary,
  HospitalTransport,
} from './dto/hospital.result';

/**
 * 통합 병원 조회.
 *
 * **healthcare 계열 테이블만 읽는다.** 원본 미러(nmc, hira)를 보지 않는다 — 통째로 지워도
 * 이 서비스는 동작한다. 코드도 우리 코드(healthcare_code, region_code)만 쓴다.
 *
 * 예전에는 `?source=hira|nmc` 로 어느 원본을 볼지 골랐다. 그러면
 *   - 같은 병원이 두 번 나오고
 *   - source=hira 면 진료시간·응급실이 없고, source=nmc 면 병상·장비가 없었다.
 * 이제 한 병원이 한 행이고, 어느 원본에서 왔는지는 sources 블록에만 남는다.
 */
@Injectable()
export class HealthcareHospitalService {
  constructor(private readonly prisma: PrismaService) {}

  async search(command: HospitalSearchCommand): Promise<Page<HospitalSummary>> {
    const where = this.buildWhere(command);

    const [rows, total] = await Promise.all([
      this.prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
        SELECT h.id, h.name, h.tel, h.addr, h.post_no, h.lat, h.lon,
               h.emergency_yn, h.baby_yn, h.emdong_nm,
               JSON_UNQUOTE(JSON_EXTRACT(h.transport, '$.subway[0].arrival')) AS station,
               h.class_cd, c.nm AS class_nm, h.tier,
               h.region_cd, r.nm AS region_nm,
               r.parent_cd AS sido_cd, sr.nm AS sido_nm
          FROM healthcare_hospital h
          LEFT JOIN healthcare_code c ON c.tp = 'class' AND c.cd = h.class_cd
          LEFT JOIN region_code r ON r.cd = h.region_cd
          LEFT JOIN region_code sr ON sr.cd = r.parent_cd
         WHERE ${where}
         ORDER BY h.id
         LIMIT ${command.size} OFFSET ${(command.page - 1) * command.size}
      `),
      this.prisma.$queryRaw<{ c: bigint }[]>(Prisma.sql`
        SELECT COUNT(*) c FROM healthcare_hospital h WHERE ${where}
      `),
    ]);

    return new Page(
      rows.map((row) => this.toSummary(row)),
      command.page,
      command.size,
      Number(total[0]?.c ?? 0),
    );
  }

  async get(id: number): Promise<HospitalDetail | null> {
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>(
      Prisma.sql`
        SELECT h.id, h.name, h.tel, h.addr, h.post_no, h.lat, h.lon,
               h.emergency_yn, h.baby_yn, h.emdong_nm, h.homepage, h.estb_dd,
               h.ykiho, h.hpid,
               h.intro, h.notice, h.directions, h.transport,
               h.park_qty, h.park_paid, h.park_note,
               h.class_cd, c.nm AS class_nm, h.tier,
               h.region_cd, r.nm AS region_nm,
               r.parent_cd AS sido_cd, sr.nm AS sido_nm
          FROM healthcare_hospital h
          LEFT JOIN healthcare_code c ON c.tp = 'class' AND c.cd = h.class_cd
          LEFT JOIN region_code r ON r.cd = h.region_cd
          LEFT JOIN region_code sr ON sr.cd = r.parent_cd
         WHERE h.id = ${id} AND h.status = 'active'
      `,
    );

    const row = rows[0];
    if (!row) {
      return null;
    }

    const [subjects, hours, staff, beds, equipments, capabilities] =
      await Promise.all([
        this.prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
          SELECT s.subject_cd, c.nm, s.declared, s.doctor_cnt, s.specialist_cnt
            FROM healthcare_hospital_subject s
            JOIN healthcare_code c ON c.tp = 'subject' AND c.cd = s.subject_cd
           WHERE s.hospital_id = ${id}
           ORDER BY c.sort
        `),
        this.prisma.healthcare_hospital_hours.findMany({
          where: { hospital_id: id },
          orderBy: [{ kind: 'asc' }, { day: 'asc' }],
        }),
        this.prisma.healthcare_hospital_staff.findUnique({
          where: { hospital_id: id },
        }),
        this.prisma.healthcare_hospital_bed.findUnique({
          where: { hospital_id: id },
        }),
        this.prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
          SELECT e.equipment_cd, c.nm, e.cnt
            FROM healthcare_hospital_equipment e
            JOIN healthcare_code c ON c.tp = 'equipment' AND c.cd = e.equipment_cd
           WHERE e.hospital_id = ${id}
           ORDER BY c.sort
        `),
        this.prisma.healthcare_hospital_capability.findMany({
          where: { hospital_id: id },
          orderBy: [{ tp: 'asc' }, { cd: 'asc' }],
        }),
      ]);

    return {
      ...this.toSummary(row),
      sources: {
        ykiho: (row.ykiho as string | null) ?? undefined,
        hpid: (row.hpid as string | null) ?? undefined,
      },
      homepage: (row.homepage as string | null) ?? undefined,
      establishedAt: (row.estb_dd as string | null) ?? undefined,
      intro: (row.intro as string | null) ?? undefined,
      notice: (row.notice as string | null) ?? undefined,
      directions: (row.directions as string | null) ?? undefined,
      transport: this.transport(row.transport),
      parking:
        row.park_qty !== null || row.park_note !== null
          ? {
              capacity: this.num(row.park_qty),
              paid:
                row.park_paid === null || row.park_paid === undefined
                  ? undefined
                  : Boolean(row.park_paid),
              note: (row.park_note as string | null) ?? undefined,
            }
          : undefined,

      subjects: subjects.map((s) => ({
        code: String(s.subject_cd),
        name: String(s.nm),
        declared: Boolean(s.declared),
        doctorCount: this.num(s.doctor_cnt),
        specialistCount: this.num(s.specialist_cnt),
      })),

      hours: hours.map((h) => ({
        kind: h.kind,
        day: h.day,
        open: h.open_time ?? undefined,
        close: h.close_time ?? undefined,
        breakStart: h.break_start ?? undefined,
        breakEnd: h.break_end ?? undefined,
      })),

      staff: staff
        ? {
            doctorTotal: staff.doctor_total ?? undefined,
            specialist: staff.specialist ?? undefined,
            resident: staff.resident ?? undefined,
            intern: staff.intern ?? undefined,
            generalDoctor: staff.general_doctor ?? undefined,
            dentist: staff.dentist ?? undefined,
            oriental: staff.oriental ?? undefined,
            midwife: staff.midwife ?? undefined,
          }
        : undefined,

      beds: beds
        ? {
            total: beds.total ?? undefined,
            standard: beds.standard ?? undefined,
            higher: beds.higher ?? undefined,
            icu: beds.icu ?? undefined,
            emergency: beds.emergency ?? undefined,
            operatingRoom: beds.operating_room ?? undefined,
            delivery: beds.delivery ?? undefined,
            neonatal: beds.neonatal ?? undefined,
            isolation: beds.isolation ?? undefined,
            psyOpen: beds.psy_open ?? undefined,
            psyClosed: beds.psy_closed ?? undefined,
          }
        : undefined,

      equipments: equipments.map((e) => ({
        code: String(e.equipment_cd),
        name: String(e.nm),
        count: this.num(e.cnt),
      })),

      capabilities: capabilities.map((c) => ({
        type: c.tp,
        code: c.cd,
        name: c.nm ?? undefined,
      })),
    };
  }

  /**
   * 검색 조건.
   *
   * 진료과목은 별도 테이블이라 EXISTS 로 건다. 조인하면 병원이 과목 수만큼 중복된다.
   * 지역·종별은 healthcare_hospital 의 인덱스(region_cd, class_cd)를 그대로 탄다.
   */
  private buildWhere(command: HospitalSearchCommand): Prisma.Sql {
    const conditions: Prisma.Sql[] = [Prisma.sql`h.status = 'active'`];

    if (command.regionCd) {
      /**
       * 시도 코드로도 검색된다.
       *
       * 병원이 갖는 건 시군구 코드뿐이다. 시도 코드가 들어오면 그 시도에 속한 시군구
       * (region_code.parent_cd = 시도) 전체로 확장한다. 서브쿼리가 인덱스를 타므로
       * 코드 목록을 애플리케이션에서 펼쳐 IN 절로 넘길 필요가 없다.
       */
      conditions.push(Prisma.sql`(
        h.region_cd = ${command.regionCd}
        OR h.region_cd IN (
          SELECT cd FROM region_code WHERE parent_cd = ${command.regionCd}
        )
      )`);
    }
    if (command.classCds?.length) {
      conditions.push(
        Prisma.sql`h.class_cd IN (${Prisma.join(command.classCds)})`,
      );
    }

    if (command.tiers?.length) {
      conditions.push(Prisma.sql`h.tier IN (${Prisma.join(command.tiers)})`);
    } else {
      // 등급을 안 고르면 요양·정신은 뺀다. 외래를 찾는 사람에게는 방해다.
      // tier 가 NULL 인 것(기타)은 남긴다 — NULL NOT IN (...) 은 NULL 이라 IS NULL 을 따로 본다.
      conditions.push(Prisma.sql`(
        h.tier IS NULL OR h.tier NOT IN (${Prisma.join([...INPATIENT_TIERS])})
      )`);
    }
    if (command.name) {
      /**
       * **병원 이름 또는 지하철역.**
       *
       * 사용자는 "혜화역" 이라고 친다 — 병원 이름을 모르니까. 한국에서 지하철역은 위치를
       * 가늠하는 1차 기준이고, "혜화역 근처 병원" 이 자연스러운 검색어다.
       * 이름만 걸면 "혜화역" 은 0건이 나오고, 사용자는 우리 검색이 고장난 줄 안다.
       *
       * 역 이름은 transport JSON 의 지하철 하차지점에 있다. "혜화역"·"혜화역 3번출구" 처럼
       * 표기가 제각각이라 LIKE 로 건다. 병원 2,053곳만 지하철 정보가 있어 대상이 작다.
       */
      const keyword = `%${command.name}%`;
      conditions.push(Prisma.sql`(
        h.name LIKE ${keyword}
        OR JSON_SEARCH(h.transport->'$.subway[*].arrival', 'one', ${keyword}) IS NOT NULL
      )`);
    }
    if (command.emergency) {
      conditions.push(Prisma.sql`h.emergency_yn = 1`);
    }
    if (command.baby) {
      conditions.push(Prisma.sql`h.baby_yn = 1`);
    }
    if (command.subjectCds?.length) {
      // 조인이 아니라 EXISTS 다. 조인하면 병원이 과목 수만큼 중복된다.
      conditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM healthcare_hospital_subject s
         WHERE s.hospital_id = h.id
           AND s.subject_cd IN (${Prisma.join(command.subjectCds)})
      )`);
    }

    return Prisma.join(conditions, ' AND ');
  }

  private toSummary(row: Record<string, unknown>): HospitalSummary {
    const regionCd = row.region_cd as string | null;
    const classCd = asString(row.class_cd);
    const tierCd = asString(row.tier);
    const sidoCd = asString(row.sido_cd);

    return {
      id: Number(row.id),
      name: String(row.name),
      category: classCd
        ? { code: classCd, name: asString(row.class_nm) ?? '' }
        : undefined,
      // 등급 이름은 시드가 갖는다. DB 에는 코드만 넣어 두 곳에 이름이 생기지 않게 한다.
      tier: tierCd ? this.tier(tierCd) : undefined,
      tel: (row.tel as string | null) ?? undefined,
      emergency: Boolean(row.emergency_yn),
      baby: Boolean(row.baby_yn),
      location: {
        address: (row.addr as string | null) ?? undefined,
        postNo: (row.post_no as string | null) ?? undefined,
        lat: this.num(row.lat),
        lon: this.num(row.lon),
        station: stationName(asString(row.station)) ?? undefined,
        region: regionCd
          ? {
              code: regionCd,
              name: asString(row.region_nm) ?? '',
              sido: sidoCd
                ? {
                    code: sidoCd,
                    name: asString(row.sido_nm) ?? '',
                  }
                : undefined,
              emdong: (row.emdong_nm as string | null) ?? undefined,
            }
          : undefined,
      },
    };
  }

  /**
   * 대중교통. 빌드가 이미 수단별로 묶어 넣어둬서 그대로 내보낸다.
   * 없는 병원이 많으므로(NMC 전용·의원급 미수집) 빈 목록으로 채워 프론트의 분기를 줄인다.
   */
  private transport(value: unknown): HospitalTransport {
    const empty: HospitalTransport = { subway: [], bus: [], etc: [] };
    if (!value || typeof value !== 'object') {
      return empty;
    }
    const t = value as Partial<HospitalTransport>;
    return {
      subway: t.subway ?? [],
      bus: t.bus ?? [],
      etc: t.etc ?? [],
    };
  }

  /** 등급 코드 → 이름. 요양·정신은 HOSPITAL_TIERS 에 없다 — 등급이 아니라 성격이라서다. */
  private tier(code: string): { code: string; name: string } {
    const tier = HOSPITAL_TIERS.find((t) => t.code === code);
    if (tier) {
      return { code, name: tier.name };
    }
    const names: Record<string, string> = {
      NURSING: '요양병원',
      MENTAL: '정신병원',
    };
    return { code, name: names[code] ?? code };
  }

  private num(value: unknown): number | undefined {
    if (value === null || value === undefined) {
      return undefined;
    }
    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
}
