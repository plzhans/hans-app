import { Injectable } from '@nestjs/common';
import {
  Prisma,
  PrismaService,
  type HealthcareHospitalI18n,
  type HiraHospitalAsm,
} from '@hansapp/data';
import { INPATIENT_TIERS } from '@hansapp/data/seed';
import type { SupportedLang } from '@hansapp/common';

/**
 * 통합 병원 저장소. healthcare_* 테이블을 읽고, 병원평가만 예외로 hira_hospital_asm 을 읽는다
 * (사유는 HealthcareHospitalService 클래스 주석 참고).
 *
 * DB 접근·쿼리 조립만 담당한다. 코드표/지역 캐시는 알지 못한다 — 캐시에 의존하는 값(지역 코드
 * 확장, 병원평가 컬럼 검증)은 서비스가 풀어 HospitalSearchFilter 로 넘긴다. 반환은 Prisma
 * 모델(엔티티)이거나, 조인·JSON 추출로 모델과 모양이 다른 조회는 아래 프로젝션 타입이다.
 */

/**
 * 검색 조건. **서비스가 캐시로 이미 풀어 넘긴 원시 값들이다.**
 * 지역 코드는 시도→시군구로 편 목록이고, asmExcellent 는 검증된 컬럼명·값이다.
 */
export interface HospitalSearchFilter {
  /** 시도→시군구로 이미 편 지역 코드. RegionCache.selfAndChildren 의 결과. */
  regionCds?: string[];
  classCds?: string[];
  /** 비면 repo 가 입원계열(요양·정신) 제외 기본조건을 건다. */
  tiers?: string[];
  name?: string;
  /**
   * id 단건 조회. 키워드 `id:{통합병원id}`→id, `hira:{요양기호}`→hira, `nmc:{기관ID}`→nmc 로 온다.
   * **하나라도 있으면 다른 필터는 무시하고 그 id 로만 건다**(단건 조회 의도) — 저장소가 조기 반환한다.
   * 셋 다 유일키라 최대 1건이다. **필드명은 원본 이름(hira/nmc)** 이고, 저장소가 실제 컬럼
   * (ykiho/hpid)으로 옮긴다 — 원본 컬럼명이 헷갈려서 도메인 이름으로 받는다.
   */
  id?: number;
  hira?: string;
  nmc?: string;
  emergency?: boolean;
  baby?: boolean;
  /**
   * 적정성평가 우수(1등급) 항목 코드('01','12','16' …). **서비스가 asm 코드표로 검증한 값만** 온다.
   * 저장소별로 거는 방식이 달라(DB 는 asm_XX 컬럼, ES 는 asm_excellent_cds 텀) 원시 코드로 넘기고
   * 각 저장소가 자기 형태로 푼다. 코드는 검증됐으므로 컬럼명으로 조립해도 인젝션이 안 된다.
   */
  asmExcellentCds?: string[];
  specialtyCds?: string[];
  specialCds?: string[];
  equipmentCds?: string[];
  subjectCds?: string[];
  specialistCds?: string[];
}

/**
 * 무한 스크롤 한 묶음. **커서 방식(offset/id/search_after)에 무관한 공통 반환**이다.
 * 저장소가 size+1 로 다음 페이지 유무를 판정해 딱 size 개만 담고, 다음 커서(nextToken)를 만든다.
 * nextToken 이 없으면 다음 페이지가 없다는 뜻이다.
 */
export interface HospitalScrollRows {
  rows: HospitalListRow[];
  nextToken?: string;
}

/**
 * 무한 스크롤 원천. DB(HealthcareHospitalRepository)와 ES(HealthcareHospitalSearchRepository)가
 * **같은 계약으로** 구현한다 — 서비스는 db 플래그로 둘 중 하나를 골라 대행시킬 뿐, 결과 모양은 같다.
 *
 * nextToken 은 **불투명 커서**다. DB 는 마지막 병원 id, ES 는 base64(search_after) 를 담지만
 * 서비스·클라이언트는 내용을 해석하지 않는다 — 다음 호출에 그대로 되돌려주면 이어진다.
 */
export interface HospitalScrollSource {
  searchScroll(
    filter: HospitalSearchFilter,
    lang: SupportedLang,
    nextToken: string | undefined,
    size: number,
  ): Promise<HospitalScrollRows>;
}

/**
 * 검색 결과 한 행(프로젝션). healthcare_hospital 엔티티와 모양이 다르다 — 전문병원분야(specialty_cd)
 * 를 조인하고, transport JSON 에서 지하철 하차지점을 뽑아 넣는다. 값은 raw 조회라 드라이버가
 * 타입을 섞어 줄 수 있어(DECIMAL→문자열 등) 매핑에서 강제한다.
 */
export interface HospitalListRow {
  id: number;
  name: string;
  tel: string | null;
  addr: string | null;
  post_no: string | null;
  lat: unknown;
  lon: unknown;
  emergency_yn: number | null;
  baby_yn: number | null;
  emdong_nm: string | null;
  i18n_name: string | null;
  station: string | null;
  station_line: string | null;
  class_cd: string | null;
  tier: string | null;
  specialty_cd: string | null;
  region_cd: string | null;
}

/**
 * 상세 조회 결과. 본체 + 자식 테이블(과목·시간·인력·병상·장비·capability)을
 * relationLoadStrategy:'join' 으로 한 방에 가져온 모양이다. i18n·병원평가는 여기 없다
 * (i18n 은 캐시를 언어별로 쪼개려 findI18n 이, 평가는 릴레이션이 없어 findAssessment 가 따로 읽는다).
 */
export type HospitalDetailModel = Prisma.HealthcareHospitalGetPayload<{
  include: {
    subjects: true;
    hours: true;
    staff: true;
    beds: true;
    equipments: true;
    capabilities: true;
  };
}>;

@Injectable()
export class HealthcareHospitalRepository implements HospitalScrollSource {
  constructor(private readonly prisma: PrismaService) {}

  /** 검색 한 페이지. 종별·전문병원분야·지역 이름은 조인하지 않는다 — 코드만 뽑고 이름은 서비스가 캐시에서 붙인다. */
  search(
    filter: HospitalSearchFilter,
    lang: SupportedLang,
    page: number,
    size: number,
  ): Promise<HospitalListRow[]> {
    const where = this.buildWhere(filter);
    return this.prisma.$queryRaw<HospitalListRow[]>(Prisma.sql`
      ${this.selectFrom(lang)}
       WHERE ${where}
       ORDER BY h.id
       LIMIT ${size} OFFSET ${(page - 1) * size}
    `);
  }

  /**
   * 무한 스크롤 한 묶음(DB). **offset 이 아니라 id 커서로** 다음 구간을 집는다.
   *
   * nextToken 은 직전 응답의 마지막 병원 id 다(불투명하지만 여기선 곧 id). 디코딩해 `h.id > afterId`
   * 로 그 이후만 읽으므로 정렬(ORDER BY h.id)이 커서와 일치한다. **size+1 개를 뽑아** 다음 페이지
   * 유무를 판정하고, 남으면 size 로 자른 뒤 마지막 id 를 다음 nextToken 으로 준다(없으면 끝).
   */
  async searchScroll(
    filter: HospitalSearchFilter,
    lang: SupportedLang,
    nextToken: string | undefined,
    size: number,
  ): Promise<HospitalScrollRows> {
    const afterId = decodeIdToken(nextToken);
    const where = this.buildWhere(filter);
    const cursor =
      afterId !== undefined ? Prisma.sql`AND h.id > ${afterId}` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<HospitalListRow[]>(Prisma.sql`
      ${this.selectFrom(lang)}
       WHERE ${where} ${cursor}
       ORDER BY h.id
       LIMIT ${size + 1}
    `);

    const hasMore = rows.length > size;
    const page = hasMore ? rows.slice(0, size) : rows;
    return {
      rows: page,
      nextToken: hasMore ? String(page[page.length - 1].id) : undefined,
    };
  }

  /**
   * 목록 SELECT + FROM/JOIN 공통 조각. 페이지·스크롤이 **같은 프로젝션**을 써야
   * 두 경로의 매핑(listRowToSource)이 한 벌로 유지된다. WHERE·ORDER·LIMIT 만 호출부가 얹는다.
   */
  private selectFrom(lang: SupportedLang): Prisma.Sql {
    return Prisma.sql`
      SELECT h.id, h.name, h.tel, h.addr, h.post_no, h.lat, h.lon,
             h.emergency_yn, h.baby_yn, h.emdong_nm,
             i.name AS i18n_name,
             JSON_UNQUOTE(JSON_EXTRACT(h.transport, '$.subway[0].arrival')) AS station,
             JSON_UNQUOTE(JSON_EXTRACT(h.transport, '$.subway[0].line')) AS station_line,
             h.class_cd,
             h.tier,
             spc.cd AS specialty_cd,
             h.region_cd
        FROM healthcare_hospital h
        -- 종별·전문병원분야·지역 이름은 조인하지 않는다 — 코드만 SELECT 하고
        -- 이름은 부팅 때 올려둔 캐시(HealthcareCodeCache·RegionCache)에서 붙인다.
        -- 전문병원 지정은 병원당 최대 1건이라 이 JOIN 이 행을 늘리지 않는다.
        LEFT JOIN healthcare_hospital_capability spc ON spc.hospital_id = h.id AND spc.tp = 'specialty'
        LEFT JOIN healthcare_hospital_i18n i ON i.hospital_id = h.id AND i.lang = ${lang}`;
  }

  /** 검색 조건에 맞는 총 건수. */
  async countSearch(filter: HospitalSearchFilter): Promise<number> {
    const where = this.buildWhere(filter);
    const rows = await this.prisma.$queryRaw<{ c: bigint }[]>(Prisma.sql`
      SELECT COUNT(*) c FROM healthcare_hospital h WHERE ${where}
    `);
    return Number(rows[0]?.c ?? 0);
  }

  /**
   * 상세용 병원 한 행 + 자식 테이블. **한 방(relationLoadStrategy:'join')으로 가져온다.**
   *
   * 자식(과목·시간·인력·병상·장비·capability)은 FK 릴레이션으로 묶여 include 로 딸려온다.
   * **언어와 무관하다** — 번역은 findI18n 으로 따로 읽어 캐시를 (id,lang) 로 쪼갠다.
   * 전문분야(specialty)는 서비스가 capabilities 에서 뽑고, 병원평가는 릴레이션이 없어 findAssessment 가 읽는다.
   *
   * status='active' 조건이 있어 findUnique(유니크 필드만) 가 아니라 findFirst 다. 없으면 null.
   */
  findDetail(id: number): Promise<HospitalDetailModel | null> {
    return this.prisma.healthcareHospital.findFirst({
      where: { id, status: 'active' },
      relationLoadStrategy: 'join',
      include: {
        subjects: true,
        // 정렬은 코드 캐시 sort 로 앱에서 하지만, 시간은 kind·day 가 자연 순서라 여기서 정렬해 둔다.
        hours: { orderBy: [{ kind: 'asc' }, { day: 'asc' }] },
        staff: true,
        beds: true,
        equipments: true,
        capabilities: true,
      },
    });
  }

  /**
   * 병원의 한 언어 번역. 없으면(그 언어 번역이 아직 없음) null.
   * 상세(findDetail)와 분리해 (id,lang) 단위로 캐시하기 쉽게 둔다 — 캐시 객체가 작아진다.
   */
  findI18n(
    id: number,
    lang: SupportedLang,
  ): Promise<HealthcareHospitalI18n | null> {
    return this.prisma.healthcareHospitalI18n.findUnique({
      where: { hospitalId_lang: { hospitalId: id, lang } },
    });
  }

  findAssessment(ykiho: string): Promise<HiraHospitalAsm | null> {
    return this.prisma.hiraHospitalAsm.findUnique({ where: { ykiho } });
  }

  /**
   * 검색 조건.
   *
   * 진료과목은 별도 테이블이라 EXISTS 로 건다. 조인하면 병원이 과목 수만큼 중복된다.
   * 지역·종별은 healthcare_hospital 의 인덱스(region_cd, class_cd)를 그대로 탄다.
   */
  private buildWhere(filter: HospitalSearchFilter): Prisma.Sql {
    const conditions: Prisma.Sql[] = [Prisma.sql`h.status = 'active'`];

    // id 단건 조회(id:/hira:/nmc:). **다른 조건은 무시**하고 그 id 로만 건다 — 요양·정신 기본 제외 등
    // 일반 검색 규칙에 걸려 단건이 안 나오는 걸 막는다. 셋 다 @unique 라 최대 1건이다.
    if (filter.id !== undefined || filter.hira || filter.nmc) {
      if (filter.id !== undefined) {
        conditions.push(Prisma.sql`h.id = ${filter.id}`);
      }
      if (filter.hira) {
        conditions.push(Prisma.sql`h.ykiho = ${filter.hira}`);
      }
      if (filter.nmc) {
        conditions.push(Prisma.sql`h.hpid = ${filter.nmc}`);
      }
      return Prisma.join(conditions, ' AND ');
    }

    if (filter.regionCds?.length) {
      // 시도 코드도 검색된다 — 서비스가 [자신 + 하위 시군구] 로 펴서 넘긴다(시군구면 자신뿐이라 등가).
      conditions.push(
        Prisma.sql`h.region_cd IN (${Prisma.join(filter.regionCds)})`,
      );
    }
    if (filter.classCds?.length) {
      conditions.push(
        Prisma.sql`h.class_cd IN (${Prisma.join(filter.classCds)})`,
      );
    }

    if (filter.tiers?.length) {
      conditions.push(Prisma.sql`h.tier IN (${Prisma.join(filter.tiers)})`);
    } else {
      // 등급을 안 고르면 요양·정신은 뺀다. 외래를 찾는 사람에게는 방해다.
      // tier 가 NULL 인 것(기타)은 남긴다 — NULL NOT IN (...) 은 NULL 이라 IS NULL 을 따로 본다.
      conditions.push(Prisma.sql`(
        h.tier IS NULL OR h.tier NOT IN (${Prisma.join([...INPATIENT_TIERS])})
      )`);
    }
    if (filter.name) {
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
      const keyword = `%${filter.name}%`;
      conditions.push(Prisma.sql`(
        h.name LIKE ${keyword}
        OR JSON_SEARCH(h.transport->'$.subway[*].arrival', 'one', ${keyword}) IS NOT NULL
      )`);
    }
    if (filter.emergency) {
      conditions.push(Prisma.sql`h.emergency_yn = 1`);
    }
    if (filter.baby) {
      conditions.push(Prisma.sql`h.baby_yn = 1`);
    }
    if (filter.asmExcellentCds?.length) {
      /**
       * 적정성평가 우수(1등급) 항목 필터. **검색이 원본 미러를 읽는 유일한 예외다.**
       *
       * 병원평가는 HIRA 전용이라 통합할 상대(NMC)가 없고, 사용자가 수정 요청할 값도 아니라
       * healthcare_* 로 복제하지 않고 상세 페이지처럼 미러(hira_hospital_asm)를 직접 조인한다.
       * 미러를 지우면 이 필터만 결과가 빈다(검색 자체는 동작). ykiho 없는 병원은 EXISTS 로 자연히 빠진다.
       *
       * 코드는 **서비스가 asm 코드표로 검증한 값**만 오므로 `asm_${코드}` 컬럼으로 조립해도
       * 인젝션이 안 된다. 1등급 값은 '1' 이지만 천식(16)만 '양호' 다(원본 인코딩이 그 항목만 다르다).
       */
      const conds = filter.asmExcellentCds.map(
        (code) =>
          Prisma.sql`ha.${Prisma.raw(`asm_${code}`)} = ${
            code === ASTHMA_ASM_CODE ? '양호' : '1'
          }`,
      );
      conditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM hira_hospital_asm ha
         WHERE ha.ykiho = h.ykiho AND (${Prisma.join(conds, ' OR ')})
      )`);
    }
    if (filter.specialtyCds?.length) {
      // 전문병원 지정분야. capability 는 병원당 N행이라 EXISTS 로 건다(과목과 같은 방식).
      conditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM healthcare_hospital_capability cap
         WHERE cap.hospital_id = h.id
           AND cap.tp = 'specialty'
           AND cap.cd IN (${Prisma.join(filter.specialtyCds)})
      )`);
    }
    if (filter.specialCds?.length) {
      // 특수진료(방문진료·치매주치의 등). 전문분야와 같은 테이블, tp 만 다르다.
      conditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM healthcare_hospital_capability cap
         WHERE cap.hospital_id = h.id
           AND cap.tp = 'special'
           AND cap.cd IN (${Prisma.join(filter.specialCds)})
      )`);
    }
    if (filter.equipmentCds?.length) {
      // 보유장비(CT·MRI·PET …). 병원당 N행이라 EXISTS.
      conditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM healthcare_hospital_equipment e
         WHERE e.hospital_id = h.id
           AND e.equipment_cd IN (${Prisma.join(filter.equipmentCds)})
      )`);
    }
    if (filter.subjectCds?.length) {
      // 조인이 아니라 EXISTS 다. 조인하면 병원이 과목 수만큼 중복된다.
      conditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM healthcare_hospital_subject s
         WHERE s.hospital_id = h.id
           AND s.subject_cd IN (${Prisma.join(filter.subjectCds)})
      )`);
    }

    if (filter.specialistCds?.length) {
      // 진료과목과 같은 코드지만 **전문의를 실제로 보유한** 병원만(specialist_cnt > 0).
      // 신고만 하면 걸리는 subjectCds 와 다르다.
      conditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM healthcare_hospital_subject s
         WHERE s.hospital_id = h.id
           AND s.subject_cd IN (${Prisma.join(filter.specialistCds)})
           AND s.specialist_cnt > 0
      )`);
    }

    return Prisma.join(conditions, ' AND ');
  }
}

/** 천식. 이 항목만 1등급을 '양호' 로 표기한다(원본 인코딩). 나머지는 '1'. */
const ASTHMA_ASM_CODE = '16';

/**
 * DB 스크롤 nextToken → afterId(병원 id). 지금은 토큰이 곧 마지막 병원 id 라 그대로 파싱한다.
 * 비었거나 양의 정수가 아니면 undefined(처음부터) — 조작된 토큰에 500 을 내지 않고 첫 페이지로 흘린다.
 */
function decodeIdToken(token: string | undefined): number | undefined {
  if (!token) {
    return undefined;
  }
  const id = Number(token);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}
