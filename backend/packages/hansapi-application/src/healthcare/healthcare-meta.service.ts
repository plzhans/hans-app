import { Injectable } from '@nestjs/common';
import { PrismaService } from '@hansapi/data';
import { HOSPITAL_TIERS, SUBJECT_GROUPS } from '@hansapi/data/seed';

/** 코드 항목 */
export interface MetaCode {
  code: string;
  name: string;
  description?: string;
}

/** 지역 항목 */
export interface MetaRegion {
  code: string;

  /** 정식 명칭. "서울특별시" — **검색·매칭은 이걸 쓴다.** */
  name: string;

  /** 화면 표시용 짧은 이름. "서울" — 시군구는 이미 짧아서 없다. */
  shortName?: string;

  /** 시도면 없다 */
  parentCode?: string;

  /** sido | sggu */
  level: string;
}

/**
 * 진료 분야 그룹. 기본 검색의 칩이다.
 *
 * 원본에는 없는 **우리 분류**다. 47개 진료과목은 행정·수가 체계라 환자가 읽는 언어가 아니다.
 * 클라이언트는 그룹을 고른 뒤 subjects 를 펼쳐서 검색의 subject 파라미터로 넘긴다 —
 * 그래서 검색 API 는 그룹이라는 개념을 몰라도 된다. 분류가 바뀌어도 검색은 안 바뀐다.
 */
export interface MetaSubjectGroup {
  code: string;
  name: string;
  subjects: MetaCode[];
}

/** 병원 등급(TIER1~3). 종별의 상위 묶음이다. */
export interface MetaHospitalTier {
  code: string;
  name: string;
  description: string;
  classes: MetaCode[];
}

/** 코드 종류. 원본 코드가 아니라 **우리 코드**다. */
export const META_CODE_TYPES = [
  'subject',
  'class',
  'equipment',
  'severe',
] as const;

export type MetaCodeType = (typeof META_CODE_TYPES)[number];

/**
 * 참조 데이터(meta) 조회.
 *
 * 저장은 healthcare_code 한 테이블에 tp 로 구분해 담지만, **API 는 종류별로 나눠서 낸다** —
 * 대외 사용자가 `?tp=subject` 같은 우리 내부 사정을 알 필요가 없다.
 * 나중에 종류별로 테이블을 떼어내도 이 서비스 안쪽만 바뀌고 API 는 그대로다.
 *
 * 원본 매핑(hira_cd/nmc_cd)은 응답에 내지 않는다. 우리 내부 사정이다.
 */
@Injectable()
export class HealthcareMetaService {
  constructor(private readonly prisma: PrismaService) {}

  async listCodes(tp: MetaCodeType): Promise<MetaCode[]> {
    const rows = await this.prisma.healthcare_code.findMany({
      where: { tp },
      orderBy: [{ sort: 'asc' }, { cd: 'asc' }],
    });

    return rows.map((row) => ({
      code: row.cd,
      name: row.nm,
      description: row.cmt ?? undefined,
    }));
  }

  /**
   * 진료 분야 그룹. 시드의 코드 목록에 **이름을 붙여** 내려준다.
   *
   * 시드에는 코드만 있다(['OS','NS',…]). 이름은 healthcare_code 가 갖는다 —
   * 이름을 두 곳에 두면 반드시 어긋난다.
   */
  async listSubjectGroups(): Promise<MetaSubjectGroup[]> {
    const names = await this.codeNames('subject');

    return SUBJECT_GROUPS.map((group) => ({
      code: group.code,
      name: group.name,
      subjects: group.subjects.map((cd) => ({
        code: cd,
        name: names.get(cd) ?? cd,
      })),
    }));
  }

  /** 병원 등급. 종별을 TIER1~3 으로 묶은 것이다. */
  async listHospitalTiers(): Promise<MetaHospitalTier[]> {
    const names = await this.codeNames('class');

    return HOSPITAL_TIERS.map((tier) => ({
      code: tier.code,
      name: tier.name,
      description: tier.cmt,
      classes: tier.classes.map((cd) => ({
        code: cd,
        name: names.get(cd) ?? cd,
      })),
    }));
  }

  private async codeNames(tp: MetaCodeType): Promise<Map<string, string>> {
    const rows = await this.prisma.healthcare_code.findMany({
      where: { tp },
      select: { cd: true, nm: true },
    });
    return new Map(rows.map((row) => [row.cd, row.nm]));
  }

  /** 지역. level 로 시도/시군구를 고르고, 시군구는 parentCode 로 시도를 좁힌다. */
  async listRegions(options: {
    level?: string;
    parentCode?: string;
  }): Promise<MetaRegion[]> {
    const rows = await this.prisma.region_code.findMany({
      where: {
        ...(options.level ? { level: options.level } : {}),
        ...(options.parentCode ? { parent_cd: options.parentCode } : {}),
      },
      orderBy: [{ sort: 'asc' }, { cd: 'asc' }],
    });

    return rows.map((row) => ({
      code: row.cd,
      name: row.nm,
      shortName: row.short_nm ?? undefined,
      level: row.level,
      parentCode: row.parent_cd ?? undefined,
    }));
  }
}
