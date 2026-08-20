import { Injectable } from '@nestjs/common';
import { Prisma, PrismaService, type HealthcareHospital } from '@hansapp/data';

/**
 * 관리자 목록의 DB 조회 조건. **최소 조건만 받는다** — 이 저장소는 ES 색인이 죽어 있어도
 * 언제나 켜져 있는 자리라, 진료과목·장비 같은 EXISTS 서브쿼리를 늘릴수록 8만 행 스캔이
 * 무거워진다. 상세 조건은 HealthcareHospitalListSearchRepository(ES)가 맡는다.
 *
 * **status 를 걸지 않으면 전체 상태를 본다.** 공개 API 저장소(hansapp-application)는
 * status='active' 를 하드코딩하지만, 관리자는 비활성·병합된 병원도 확인·복구해야 한다.
 */
export interface HospitalAdminListFilter {
  /** 병원명·법인명·요양기호·기관ID 부분 일치. */
  keyword?: string;
  status?: string;
  classCd?: string;
  regionCd?: string;
}

export interface HospitalAdminPage {
  rows: HealthcareHospital[];
  total: number;
}

/**
 * healthcare_hospital 관리자 목록. **엔티티를 그대로 반환한다** — 조인이 필요 없는
 * 최소 조회라 프로젝션을 따로 두지 않는다(리포지토리 패턴 참고: 서비스가 DTO 로 매핑).
 */
@Injectable()
export class HealthcareHospitalListRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    filter: HospitalAdminListFilter,
    page: number,
    size: number,
  ): Promise<HospitalAdminPage> {
    const where = this.buildWhere(filter);
    const [rows, total] = await Promise.all([
      this.prisma.healthcareHospital.findMany({
        where,
        orderBy: { id: 'asc' },
        skip: (page - 1) * size,
        take: size,
      }),
      this.prisma.healthcareHospital.count({ where }),
    ]);
    return { rows, total };
  }

  private buildWhere(filter: HospitalAdminListFilter): Prisma.HealthcareHospitalWhereInput {
    const where: Prisma.HealthcareHospitalWhereInput = {};
    if (filter.status) {
      where.status = filter.status;
    }
    if (filter.classCd) {
      where.classCd = filter.classCd;
    }
    if (filter.regionCd) {
      where.regionCd = filter.regionCd;
    }
    if (filter.keyword) {
      // MySQL 기본 콜레이션이 대소문자를 안 가려 mode:'insensitive' 없이도 된다.
      where.OR = [
        { name: { contains: filter.keyword } },
        { legalName: { contains: filter.keyword } },
        { ykiho: { contains: filter.keyword } },
        { hpid: { contains: filter.keyword } },
      ];
    }
    return where;
  }
}
