import { Injectable } from '@nestjs/common';
import { Page } from '@hansapi/common';
import { Prisma, PrismaService } from '@hansapi/data';
import { INPATIENT_TIERS, TIER_NAMES } from '@hansapi/data/seed';
import {
  FALLBACK_LANG,
  pickLangName,
  type SupportedLang,
} from '@hansapi/common';

import { pickName } from './code-name';
import { annotateKo, pickText } from './hospital-text';

import { asString } from '../common/coerce';
import { stationName } from './station';

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

  async search(
    command: HospitalSearchCommand,
    lang: SupportedLang = FALLBACK_LANG,
  ): Promise<Page<HospitalSummary>> {
    const where = this.buildWhere(command);

    const [rows, total] = await Promise.all([
      this.prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
        SELECT h.id, h.name, h.tel, h.addr, h.post_no, h.lat, h.lon,
               h.emergency_yn, h.baby_yn, h.emdong_nm,
               i.name AS i18n_name,
               JSON_UNQUOTE(JSON_EXTRACT(h.transport, '$.subway[0].arrival')) AS station,
               h.class_cd, c.nm AS class_nm, c.nm_en AS class_nm_en, c.nm_ja AS class_nm_ja,
               h.tier,
               h.region_cd, r.nm AS region_nm, r.nm_en AS region_nm_en, r.nm_ja AS region_nm_ja,
               r.parent_cd AS sido_cd,
               sr.nm AS sido_nm, sr.nm_en AS sido_nm_en, sr.nm_ja AS sido_nm_ja
          FROM healthcare_hospital h
          LEFT JOIN healthcare_code c ON c.tp = 'class' AND c.cd = h.class_cd
          LEFT JOIN region_code r ON r.cd = h.region_cd
          LEFT JOIN region_code sr ON sr.cd = r.parent_cd
          LEFT JOIN healthcare_hospital_i18n i ON i.hospital_id = h.id AND i.lang = ${lang}
         WHERE ${where}
         ORDER BY h.id
         LIMIT ${command.size} OFFSET ${(command.page - 1) * command.size}
      `),
      this.prisma.$queryRaw<{ c: bigint }[]>(Prisma.sql`
        SELECT COUNT(*) c FROM healthcare_hospital h WHERE ${where}
      `),
    ]);

    return new Page(
      rows.map((row) => this.toSummary(row, lang)),
      command.page,
      command.size,
      Number(total[0]?.c ?? 0),
    );
  }

  async get(
    id: number,
    lang: SupportedLang = FALLBACK_LANG,
  ): Promise<HospitalDetail | null> {
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>(
      Prisma.sql`
        SELECT h.id, h.name, h.tel, h.addr, h.post_no, h.lat, h.lon,
               h.emergency_yn, h.baby_yn, h.emdong_nm, h.homepage, h.estb_dd,
               h.ykiho, h.hpid,
               h.intro, h.notice, h.directions, h.transport,
               h.park_qty, h.park_paid, h.park_note,
               i.name       AS i18n_name,
               i.intro      AS i18n_intro,
               i.notice     AS i18n_notice,
               i.directions AS i18n_directions,
               i.park_note  AS i18n_park_note,
               i.transport  AS i18n_transport,
               h.class_cd, c.nm AS class_nm, c.nm_en AS class_nm_en, c.nm_ja AS class_nm_ja,
               h.tier,
               h.region_cd, r.nm AS region_nm, r.nm_en AS region_nm_en, r.nm_ja AS region_nm_ja,
               r.parent_cd AS sido_cd,
               sr.nm AS sido_nm, sr.nm_en AS sido_nm_en, sr.nm_ja AS sido_nm_ja
          FROM healthcare_hospital h
          LEFT JOIN healthcare_code c ON c.tp = 'class' AND c.cd = h.class_cd
          LEFT JOIN region_code r ON r.cd = h.region_cd
          LEFT JOIN region_code sr ON sr.cd = r.parent_cd
          LEFT JOIN healthcare_hospital_i18n i ON i.hospital_id = h.id AND i.lang = ${lang}
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
          SELECT s.subject_cd, c.nm, c.nm_en, c.nm_ja, s.declared, s.doctor_cnt, s.specialist_cnt
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
          SELECT e.equipment_cd, c.nm, c.nm_en, c.nm_ja, e.cnt
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

    const parkNote = this.text(row, 'park_note');

    return {
      ...this.toSummary(row, lang),

      // 번역된 이름 옆에 붙일 한국어 원문. 번역이 실제로 있을 때만 온다.
      // 외국인이 영문 링크를 한국인에게 보냈을 때 언어를 안 바꿔도 알아보게 하려는 것이다.
      nameKo: annotateKo(String(row.name), row.i18n_name as string | null),

      sources: {
        ykiho: (row.ykiho as string | null) ?? undefined,
        hpid: (row.hpid as string | null) ?? undefined,
      },
      homepage: (row.homepage as string | null) ?? undefined,
      establishedAt: (row.estb_dd as string | null) ?? undefined,
      intro: this.text(row, 'intro'),
      notice: this.text(row, 'notice'),
      directions: this.text(row, 'directions'),
      transport: this.transport(pickText(row.transport, row.i18n_transport)),
      parking:
        row.park_qty !== null || parkNote !== undefined
          ? {
              capacity: this.num(row.park_qty),
              paid:
                row.park_paid === null || row.park_paid === undefined
                  ? undefined
                  : Boolean(row.park_paid),
              note: parkNote,
            }
          : undefined,

      subjects: subjects.map((s) => ({
        code: String(s.subject_cd),
        name: this.codeName(s, lang),
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
        name: this.codeName(e, lang),
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

  private toSummary(
    row: Record<string, unknown>,
    lang: SupportedLang,
  ): HospitalSummary {
    const regionCd = row.region_cd as string | null;
    const classCd = asString(row.class_cd);
    const tierCd = asString(row.tier);
    const sidoCd = asString(row.sido_cd);

    return {
      id: Number(row.id),
      // 번역이 있으면 번역, 없으면 한국어 원문. 목록도 번역된 이름으로 나가야
      // (lang, name) 인덱스가 의미를 갖는다 — 영어 사용자는 영문명으로 찾는다.
      name: String(pickText(row.name, row.i18n_name)),
      category: classCd
        ? { code: classCd, name: this.rowName(row, 'class_nm', lang) }
        : undefined,
      // 등급 이름은 시드가 갖는다. DB 에는 코드만 넣어 두 곳에 이름이 생기지 않게 한다.
      tier: tierCd ? this.tier(tierCd, lang) : undefined,
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
              name: this.rowName(row, 'region_nm', lang),
              sido: sidoCd
                ? {
                    code: sidoCd,
                    name: this.rowName(row, 'sido_nm', lang),
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

  /** nm/nm_en/nm_ja 를 그대로 가진 행(진료과목·장비)에서 이름을 고른다. */
  private codeName(row: Record<string, unknown>, lang: SupportedLang): string {
    return pickName(
      {
        nm: asString(row.nm) ?? '',
        nm_en: asString(row.nm_en),
        nm_ja: asString(row.nm_ja),
      },
      lang,
    );
  }

  /**
   * 조인해 온 코드 이름을 언어에 맞춰 고른다.
   *
   * **SQL 로 언어를 고르지 않는다.** 예전엔 `COALESCE(c.nm_en, c.nm)` 처럼 컬럼식을 동적으로
   * 만들어 끼웠는데, Prisma.sql 이 그 조각을 평탄화하지 않고 **바인딩 값으로 넣어** 버려서
   * 응답에 SQL 객체가 그대로 나왔다. 셋 다 SELECT 해서 여기서 고른다 —
   * 컬럼 두 개가 더 붙을 뿐이고, 동적 SQL 이 사라져 주입 여지도 없다.
   */
  private rowName(
    row: Record<string, unknown>,
    prefix: string,
    lang: SupportedLang,
  ): string {
    return pickName(
      {
        nm: asString(row[prefix]) ?? '',
        nm_en: asString(row[`${prefix}_en`]),
        nm_ja: asString(row[`${prefix}_ja`]),
      },
      lang,
    );
  }

  /**
   * 등급 코드 → 이름.
   *
   * 이름은 **시드(TIER_NAMES)가 유일한 출처다.** 예전엔 요양·정신 이름을 이 서비스가
   * 하드코딩했는데, 이름이 두 곳에 있으면 반드시 어긋난다.
   * 모르는 코드면 코드를 그대로 보여준다 — 빈칸보다 낫다.
   */
  private tier(
    code: string,
    lang: SupportedLang,
  ): { code: string; name: string } {
    const name = TIER_NAMES[code as keyof typeof TIER_NAMES];
    return { code, name: name ? pickLangName(name, lang) : code };
  }

  /**
   * 자유 텍스트 한 필드를 언어에 맞춰 고른다.
   *
   * SQL 이 원문(h.intro)과 번역(i.intro AS i18n_intro)을 **둘 다 그냥 SELECT** 하고,
   * 고르는 건 여기서 한다. COALESCE 를 SQL 에 넣지 않는 이유가 둘이다:
   *   1. 원문이 지워졌는데 번역이 남으면 COALESCE 는 좀비를 내놓는다 (pickText 주석 참고)
   *   2. Prisma.sql 에 컬럼식을 동적으로 끼워 넣으면 평탄화가 안 돼 바인딩 값으로 들어간다
   *      — 예전에 응답에 SQL 객체가 그대로 나간 적이 있다. 다시 밟지 않는다.
   */
  private text(
    row: Record<string, unknown>,
    field: 'intro' | 'notice' | 'directions' | 'park_note',
  ): string | undefined {
    const picked = pickText(
      row[field] as string | null,
      row[`i18n_${field}`] as string | null,
    );
    return picked ?? undefined;
  }

  private num(value: unknown): number | undefined {
    if (value === null || value === undefined) {
      return undefined;
    }
    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
}
