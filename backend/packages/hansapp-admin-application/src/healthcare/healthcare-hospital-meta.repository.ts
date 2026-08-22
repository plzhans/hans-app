import { Injectable } from '@nestjs/common';
import { PrismaService, type HealthcareCode, type HiraCode, type RegionCode } from '@hansapp/data';

/**
 * 관리자 병원 검색 필터의 코드 이름표. healthcare_code·hira_code(tp=asm*)·region_code 를
 * 그때그때 조회한다 — `@hansapp/application` 의 부팅 캐시(HealthcareCodeCache)를 admin이
 * 의존하지 않기로 한 결정에 따라, 여기서 다시 읽는다. 호출 빈도가 필터 UI 를 열 때뿐이라
 * 캐시 없이 매번 조회해도 부담이 없다.
 */
@Injectable()
export class HealthcareHospitalMetaRepository {
  constructor(private readonly prisma: PrismaService) {}

  findCodes(tp: string): Promise<HealthcareCode[]> {
    return this.prisma.healthcareCode.findMany({ where: { tp }, orderBy: { cd: 'asc' } });
  }

  /** 병원평가 항목 카탈로그. tp 가 asm01~asm09(그룹), cd 가 항목번호다. */
  findAssessmentCodes(): Promise<HiraCode[]> {
    return this.prisma.hiraCode.findMany({
      where: { tp: { startsWith: 'asm' } },
      orderBy: [{ tp: 'asc' }, { cd: 'asc' }],
    });
  }

  findRegions(): Promise<RegionCode[]> {
    return this.prisma.regionCode.findMany({ orderBy: [{ level: 'asc' }, { sort: 'asc' }] });
  }
}
