import { Injectable } from '@nestjs/common';
import {
  Prisma,
  PrismaService,
  type HealthcareHospitalI18n,
  type HiraHospitalAsm,
} from '@hansapi/data';
import { INPATIENT_TIERS } from '@hansapi/data/seed';
import type { SupportedLang } from '@hansapi/common';

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
  emergency?: boolean;
  baby?: boolean;
  /** 적정성평가 우수(1등급) 필터. column 은 검증된 코드로 만든 컬럼명이라 raw 로 끼워도 안전하다. */
  asmExcellent?: { column: string; value: string }[];
  specialtyCds?: string[];
  specialCds?: string[];
  equipmentCds?: string[];
  subjectCds?: string[];
  specialistCds?: string[];
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
export class HealthcareHospitalRepository {
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
        LEFT JOIN healthcare_hospital_i18n i ON i.hospital_id = h.id AND i.lang = ${lang}
       WHERE ${where}
       ORDER BY h.id
       LIMIT ${size} OFFSET ${(page - 1) * size}
    `);
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
    if (filter.asmExcellent?.length) {
      /**
       * 적정성평가 우수(1등급) 항목 필터. **검색이 원본 미러를 읽는 유일한 예외다.**
       *
       * 병원평가는 HIRA 전용이라 통합할 상대(NMC)가 없고, 사용자가 수정 요청할 값도 아니라
       * healthcare_* 로 복제하지 않고 상세 페이지처럼 미러(hira_hospital_asm)를 직접 조인한다.
       * 미러를 지우면 이 필터만 결과가 빈다(검색 자체는 동작). ykiho 없는 병원은 EXISTS 로 자연히 빠진다.
       *
       * **컬럼명은 서비스가 아는 코드만으로 만들어 넘겼다 — 그래서 raw 로 끼워도 인젝션이 안 된다.**
       */
      const conds = filter.asmExcellent.map(
        ({ column, value }) => Prisma.sql`ha.${Prisma.raw(column)} = ${value}`,
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
