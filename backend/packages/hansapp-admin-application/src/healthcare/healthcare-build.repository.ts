import { Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@hansapp/data';

import { CodeMapper } from './code-mapper';
import { HospitalLocks } from './hospital-lock';
import type { BuiltHospital } from './healthcare-build.service';

/** 통합 병원 본체 upsert 에서 잠금 여부를 따지는 컬럼 목록. VALUES 순서와 맞춰야 한다. */
const FIELDS = [
  /*
    **원본 키 둘은 서로를 채워 준다.** 한 행은 ykiho 로도 hpid 로도 찾힌다(둘 다 유니크).
    hpid 로 찾힌 행에 ykiho 를 넣어야 하는 경우가 있고 그 반대도 있다 — NMC 만 있던 병원에
    HIRA 가 붙기도 하고, 그 반대도 있다.

    **한쪽만 갱신 대상이면 그 방향이 막힌다.** 예전에는 hpid 만 있었는데, NMC 행을 남기고
    합쳤을 때 ykiho 가 영영 NULL 로 남아 HIRA 데이터를 통째로 잃었다(실측 15건).
    MySQL 은 어느 유니크 키로 매칭됐는지 안 알려주므로 방향을 가릴 수 없다 — 둘 다 넣는다.
    같은 값으로 덮는 쪽은 무해하다.
  */
  'ykiho',
  'hpid',
  'source',
  // name 은 파생값(법인 표기를 뗀 것)이라 잠금 대상이다 — 규칙이 못 푸는 것을 사람이 고친다.
  // legal_name 은 원문이라 잠그지 않는다. 원본이 바뀌면 따라가야 한다.
  'name',
  'legal_name',
  'corp_name',
  'addr',
  'tel',
  'homepage',
  'class_cd',
  'tier',
  'region_cd',
  'emdong_nm',
  'post_no',
  'lat',
  'lon',
  'estb_dd',
  'emergency_yn',
  'baby_yn',
  'intro',
  'notice',
  'directions',
  'park_qty',
  'park_paid',
  'park_note',
  'transport',
];

const CHUNK = 500;

/**
 * 통합 병원 빌드 저장소. 원본(hira·nmc·매칭·상세) 읽기와 healthcare_hospital 벌크 upsert 를 담당한다.
 *
 * JSON_EXTRACT 로 원본 JSON 을 펼치는 SELECT 와 ON DUPLICATE KEY upsert 가 전부 여기 있다.
 * 서비스는 두 원본을 병합하는 정책(어느 필드를 누구에서 믿을지)만 정하고, 완성된 행을 넘긴다.
 * 잠긴 컬럼 보존(IF)도 여기서 SQL 로 짓는다 — 잠금 사실 자체는 HospitalLocks 가 들고 있다.
 */
@Injectable()
export class HealthcareBuildRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** 원본 코드 → 우리 코드 변환기를 메모리에 올린다. */
  loadCodeMapper(): Promise<CodeMapper> {
    return CodeMapper.load(this.prisma);
  }

  /** 동기화 예외(잠금)를 메모리에 올린다. */
  loadLocks(): Promise<HospitalLocks> {
    return HospitalLocks.load(this.prisma);
  }

  /** hira_hospital 의 JSON 을 펼친 원시 행. 가공은 서비스가 한다. */
  loadHiraRows(): Promise<Record<string, unknown>[]> {
    return this.prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT ykiho, cl_cd, sggu_cd, emdong_nm,
             JSON_UNQUOTE(JSON_EXTRACT(data, '$.yadmNm'))  nm,
             JSON_UNQUOTE(JSON_EXTRACT(data, '$.addr'))    addr,
             JSON_UNQUOTE(JSON_EXTRACT(data, '$.telno'))   tel,
             JSON_UNQUOTE(JSON_EXTRACT(data, '$.hospUrl')) url,
             JSON_UNQUOTE(JSON_EXTRACT(data, '$.postNo'))  post_no,
             JSON_UNQUOTE(JSON_EXTRACT(data, '$.estbDd'))  estb_dd,
             JSON_EXTRACT(data, '$.YPos') lat,
             JSON_EXTRACT(data, '$.XPos') lon
        FROM hira_hospital
    `);
  }

  /** nmc_hospital 의 JSON 을 펼친 원시 행. 가공은 서비스가 한다. */
  loadNmcRows(): Promise<Record<string, unknown>[]> {
    return this.prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT hpid, duty_div, sido_nm, sggu_nm,
             JSON_UNQUOTE(JSON_EXTRACT(data, '$.dutyName')) nm,
             JSON_UNQUOTE(JSON_EXTRACT(data, '$.dutyAddr')) addr,
             JSON_UNQUOTE(JSON_EXTRACT(data, '$.dutyTel1')) tel,
             JSON_UNQUOTE(JSON_EXTRACT(data, '$.postCdn1')) post1,
             JSON_UNQUOTE(JSON_EXTRACT(data, '$.postCdn2')) post2,
             JSON_UNQUOTE(JSON_EXTRACT(data, '$.dutyEryn')) eryn,
             JSON_UNQUOTE(JSON_EXTRACT(data, '$.dutyInf')) intro,
             JSON_UNQUOTE(JSON_EXTRACT(data, '$.dutyEtc')) notice,
             JSON_UNQUOTE(JSON_EXTRACT(data, '$.dutyMapimg')) directions,
             JSON_EXTRACT(data, '$.wgs84Lat') lat,
             JSON_EXTRACT(data, '$.wgs84Lon') lon
        FROM nmc_hospital
    `);
  }

  /** HIRA ↔ NMC 매칭. */
  loadLinks(): Promise<{ ykiho: string; hpid: string }[]> {
    return this.prisma.hiraNmcLink.findMany({
      select: { ykiho: true, hpid: true },
    });
  }

  /** 달빛어린이병원 hpid 목록. */
  loadBabyHospitals(): Promise<{ hpid: string }[]> {
    return this.prisma.nmcBabyHospital.findMany({ select: { hpid: true } });
  }

  /** HIRA 세부정보(info). 주차·찾아오는 길이 여기 있다. */
  loadInfoDetails(): Promise<{ ykiho: string; data: unknown }[]> {
    return this.prisma.hiraHospitalDetail.findMany({
      where: { op: 'info' },
      select: { ykiho: true, data: true },
    });
  }

  /** HIRA 교통정보(transport). 병원당 N행이라 배열로 들어 있다. */
  loadTransportDetails(): Promise<{ ykiho: string; data: unknown }[]> {
    return this.prisma.hiraHospitalDetail.findMany({
      where: { op: 'transport' },
      select: { ykiho: true, data: true },
    });
  }

  /**
   * healthcare_hospital 에 벌크 upsert. **id 를 재사용한다** — 대외 API 가 노출하는 값이라
   * 재생성마다 바뀌면 안 된다. ykiho·hpid 가 UNIQUE 라 ON DUPLICATE KEY 가 기존 행을 찾는다.
   *
   * 잠긴 컬럼은 기존 값을 유지한다(IF). source='manual'(직접 등록)은 통째로 보존한다.
   * 컬럼 단위라 전화번호만 잠가도 주소·종별은 계속 최신을 따라간다.
   */
  /**
   * 링크가 가리키는 두 키를 **서로 다른 행이 쥐고 있는** 경우를 찾는다.
   *
   * 링크는 "이 ykiho 와 이 hpid 는 같은 병원" 이라고 말하는데 행이 둘이면, upsert 가
   * 한 행에 두 키를 몰아넣으려다 **다른 행이 쥔 키와 부딪혀 1062 로 죽는다.**
   * 유니크 키가 둘이라 ON DUPLICATE KEY UPDATE 가 구해 주지 못하는 자리다.
   *
   * **`IS NULL` 로 좁히지 않는다.** 처음에는 "양쪽이 비어 있는" 경우만 봤는데, 그러면
   * 짝이 바뀌는 경우(이미 다른 hpid 를 쥔 HIRA 행에 새 hpid 를 붙이는 것)를 놓친다.
   * 충돌의 본질은 "비어 있냐" 가 아니라 **"같은 키를 두 행이 쥐고 있냐"** 다.
   *
   * 잠긴 행(사람이 손으로 고친 값)이 어느 쪽인지도 함께 본다. 합칠 때 그쪽을 살려야 한다.
   */
  findSplitPairs(): Promise<
    { hiraId: number; nmcId: number; hiraLocked: number; nmcLocked: number }[]
  > {
    return this.prisma.$queryRaw`
      SELECT a.id AS hiraId, b.id AS nmcId,
             (SELECT COUNT(*) FROM healthcare_hospital_lock k WHERE k.hospital_id = a.id) AS hiraLocked,
             (SELECT COUNT(*) FROM healthcare_hospital_lock k WHERE k.hospital_id = b.id) AS nmcLocked
        FROM hira_nmc_link l
        JOIN healthcare_hospital a ON a.ykiho = l.ykiho
        JOIN healthcare_hospital b ON b.hpid  = l.hpid
       WHERE a.id <> b.id
    `;
  }

  /**
   * 합쳐지면서 사라지는 행을 지운다. 자식은 FK 가 CASCADE 라 함께 사라진다.
   *
   * **자식을 옮기지 않는다.** 하위 테이블은 원본에서 계산해 만드는 파생 데이터라, 남은 행이
   * ykiho·hpid 를 둘 다 갖게 되면 상세 빌드가 양쪽 자식을 다시 붙인다.
   */
  async deleteHospitals(ids: number[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    await this.prisma.healthcareHospital.deleteMany({ where: { id: { in: ids } } });
  }

  /**
   * 통합 병원 본체를 upsert 한다.
   *
   * **rows 의 배열 순서가 곧 SQL 실행 순서다. 정렬하지 마라.** 매칭이 풀린 병원은 한 행이
   * 두 행으로 갈라지는데, 먼저 오는 쪽이 기존 id 를 가져간다(서비스가 HIRA 를 앞에 둔다).
   * 여기서 순서를 바꾸면 죽지는 않고 **id 주인이 조용히 뒤바뀐다.**
   */
  async upsertHospitals(rows: BuiltHospital[], locks: HospitalLocks): Promise<void> {
    const keep = (field: string): Prisma.Sql => {
      const ids = locks.lockedHospitalsFor('healthcare_hospital', field);
      const self = Prisma.raw(`healthcare_hospital.${field}`);
      const fresh = Prisma.raw(`new.${field}`);

      // source='manual'(직접 등록)은 통째로 보존한다. 잠긴 컬럼도 보존한다.
      const locked =
        ids.size === 0
          ? Prisma.sql`healthcare_hospital.source = 'manual'`
          : Prisma.sql`healthcare_hospital.source = 'manual'
              OR healthcare_hospital.id IN (${Prisma.join([...ids])})`;

      return Prisma.sql`${Prisma.raw(field)} = IF(${locked}, ${self}, ${fresh})`;
    };

    const updates = Prisma.join(FIELDS.map(keep));

    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);

      const values = Prisma.join(
        chunk.map(
          (r) => Prisma.sql`(
            ${r.ykiho}, ${r.hpid}, ${r.source},
            ${r.name}, ${r.legal_name}, ${r.corp_name},
            ${r.addr}, ${r.tel}, ${r.homepage},
            ${r.class_cd}, ${r.tier}, ${r.region_cd}, ${r.emdong_nm}, ${r.post_no},
            ${r.lat}, ${r.lon}, ${r.estb_dd}, ${r.emergency_yn}, ${r.baby_yn},
            ${r.intro}, ${r.notice}, ${r.directions},
            ${r.park_qty}, ${r.park_paid}, ${r.park_note},
            ${r.transport === null ? null : Prisma.sql`CAST(${JSON.stringify(r.transport)} AS JSON)`},
            'active', NOW(), NOW(), NOW()
          )`,
        ),
      );

      await this.prisma.$executeRaw(Prisma.sql`
        INSERT INTO healthcare_hospital
          (ykiho, hpid, source, name, legal_name, corp_name, addr, tel, homepage,
           class_cd, tier, region_cd, emdong_nm, post_no,
           lat, lon, estb_dd, emergency_yn, baby_yn,
           intro, notice, directions, park_qty, park_paid, park_note,
           transport,
           status, built_at, created_at, updated_at)
        VALUES ${values} AS new
        ON DUPLICATE KEY UPDATE
          ${updates},
          status = 'active',
          built_at = NOW()
      `);
    }
  }
}
