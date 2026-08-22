import { Injectable } from '@nestjs/common';
import {
  PrismaService,
  Prisma,
  type HealthcareHospitalI18n,
  type HiraHospitalAsm,
  type HiraCode,
  type HealthcareCode,
  type RegionCode,
} from '@hansapp/data';

/** 상세용 병원 한 행 + 자식 테이블(과목·시간·인력·병상·장비·capability). 한 방(join)으로 가져온다. */
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

/**
 * healthcare_hospital 관리자 상세. **상태를 가리지 않는다** — 목록(HealthcareHospitalListRepository)과
 * 같은 이유로, 비활성·병합된 병원도 관리자는 열어 봐야 한다.
 *
 * 공개 API 의 HealthcareHospitalRepository.findDetail 과 조회 모양은 같지만, admin-application 이
 * `@hansapp/application` 을 의존하지 않기로 한 결정에 따라 여기서 다시 구현한다.
 */
@Injectable()
export class HealthcareHospitalDetailRepository {
  constructor(private readonly prisma: PrismaService) {}

  findHospital(id: number): Promise<HospitalDetailModel | null> {
    return this.prisma.healthcareHospital.findUnique({
      where: { id },
      relationLoadStrategy: 'join',
      include: {
        subjects: true,
        hours: { orderBy: [{ kind: 'asc' }, { day: 'asc' }] },
        staff: true,
        beds: true,
        equipments: true,
        capabilities: true,
      },
    });
  }

  findI18n(hospitalId: number): Promise<HealthcareHospitalI18n[]> {
    return this.prisma.healthcareHospitalI18n.findMany({
      where: { hospitalId },
      orderBy: { lang: 'asc' },
    });
  }

  findAssessment(ykiho: string): Promise<HiraHospitalAsm | null> {
    return this.prisma.hiraHospitalAsm.findUnique({ where: { ykiho } });
  }

  /** 병원평가 항목 카탈로그(그룹명·항목명). tp 가 asm01~asm09(그룹), cd 가 항목번호다. */
  findAssessmentCodes(): Promise<HiraCode[]> {
    return this.prisma.hiraCode.findMany({
      where: { tp: { startsWith: 'asm' } },
      orderBy: [{ tp: 'asc' }, { cd: 'asc' }],
    });
  }

  /** 이 병원에 실제로 등장한 (tp,cd) 조합의 이름만 골라 온다 — 코드표 전체를 캐시로 올리지 않는다. */
  findCodeNames(pairs: { tp: string; cd: string }[]): Promise<HealthcareCode[]> {
    if (!pairs.length) return Promise.resolve([]);
    return this.prisma.healthcareCode.findMany({ where: { OR: pairs } });
  }

  findRegionName(regionCd: string): Promise<RegionCode | null> {
    return this.prisma.regionCode.findUnique({ where: { cd: regionCd } });
  }
}
