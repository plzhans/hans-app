import { Injectable } from '@nestjs/common';
import { PrismaService } from '@hansapp/data';

@Injectable()
export class NmcMirrorDashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  countHospitals(): Promise<number> {
    return this.prisma.nmcHospital.count();
  }

  /** basicSyncedAt 이 NULL 이 아닌 병원 = "상세기본정보(basic)" 를 실제로 받은 병원. */
  countBasic(): Promise<number> {
    return this.prisma.nmcHospital.count({ where: { basicSyncedAt: { not: null } } });
  }

  countSubjects(): Promise<number> {
    return this.prisma.nmcHospitalSubject.count();
  }

  countBaby(): Promise<number> {
    return this.prisma.nmcBabyHospital.count();
  }

  countCodes(): Promise<number> {
    return this.prisma.nmcCode.count();
  }

  countRegions(): Promise<number> {
    return this.prisma.nmcRegion.count();
  }
}
