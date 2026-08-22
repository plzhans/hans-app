import { Injectable } from '@nestjs/common';
import { PrismaService } from '@hansapp/data';

/**
 * HIRA 미러 테이블별 건수. **hira_hospital_detail 은 op 로 group by 한 번에 센다** —
 * 오퍼레이션이 11개라 하나씩 세면 왕복이 11번인데, groupBy 는 한 번이면 된다.
 */
@Injectable()
export class HiraMirrorDashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  countHospitals(): Promise<number> {
    return this.prisma.hiraHospital.count();
  }

  async countDetailOps(): Promise<Record<string, number>> {
    const rows = await this.prisma.hiraHospitalDetail.groupBy({
      by: ['op'],
      _count: { _all: true },
    });
    return Object.fromEntries(rows.map((row) => [row.op, row._count._all]));
  }

  countSubjects(): Promise<number> {
    return this.prisma.hiraHospitalSubject.count();
  }

  countSrch(): Promise<number> {
    return this.prisma.hiraHospitalSrch.count();
  }

  countEquipments(): Promise<number> {
    return this.prisma.hiraHospitalEquipment.count();
  }

  countAssessments(): Promise<number> {
    return this.prisma.hiraHospitalAsm.count();
  }

  countNpay(): Promise<number> {
    return this.prisma.hiraHospitalNpay.count();
  }

  /**
   * hira_code 를 tp 로 group by 한다. **asm01~09 도 섞여 나온다** — 시드가 채운 행이라
   * 부르는 쪽(서비스)이 CODE_TP_LABEL 에 없는 tp 는 걸러서 "연동"(외부 API sync) 만 남긴다.
   */
  async countCodesByTp(): Promise<Record<string, number>> {
    const rows = await this.prisma.hiraCode.groupBy({
      by: ['tp'],
      _count: { _all: true },
    });
    return Object.fromEntries(rows.map((row) => [row.tp, row._count._all]));
  }

  countNpayCodes(): Promise<number> {
    return this.prisma.hiraNpayCode.count();
  }

  countRegions(): Promise<number> {
    return this.prisma.hiraRegion.count();
  }
}
