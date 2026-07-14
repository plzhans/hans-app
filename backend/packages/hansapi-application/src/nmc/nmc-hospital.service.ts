import { Injectable } from '@nestjs/common';
import { PrismaService } from '@hansapi/data';

import type {
  HospitalFullDownItem,
  HospitalFullDownResponse,
} from '@krdata/nmc';

import { toKrDataEnvelope } from '../common/krdata-envelope';
import { MirrorListCommand } from '../common/mirror.result';

/**
 * NMC 원본 미러 조회.
 *
 * **원본 API(getHsptlMdcncFullDown)와 똑같은 구조로 응답한다.**
 * 통합 병원 조회는 HealthcareHospitalService 다.
 */
@Injectable()
export class NmcHospitalService {
  constructor(private readonly prisma: PrismaService) {}

  async listHospitals(
    command: MirrorListCommand,
  ): Promise<HospitalFullDownResponse> {
    const [rows, totalCount] = await Promise.all([
      this.prisma.nmc_hospital.findMany({
        orderBy: { hpid: 'asc' },
        skip: (command.page - 1) * command.size,
        take: command.size,
      }),
      this.prisma.nmc_hospital.count(),
    ]);

    return toKrDataEnvelope<HospitalFullDownItem>({
      items: rows.map((row) => row.data as HospitalFullDownItem),
      pageNo: command.page,
      numOfRows: command.size,
      totalCount,
    });
  }

  /** 1건 조회. 없으면 items 가 빈 배열이다 (원본 API 와 같은 규칙). */
  async getHospital(hpid: string): Promise<HospitalFullDownResponse> {
    const row = await this.prisma.nmc_hospital.findUnique({ where: { hpid } });

    return toKrDataEnvelope<HospitalFullDownItem>({
      items: row ? [row.data as HospitalFullDownItem] : [],
      pageNo: 1,
      numOfRows: row ? 1 : 0,
      totalCount: row ? 1 : 0,
    });
  }
}
