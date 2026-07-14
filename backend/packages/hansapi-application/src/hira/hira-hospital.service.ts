import { Injectable } from '@nestjs/common';
import { PrismaService } from '@hansapi/data';

import type { HospitalItem, HospitalListResponse } from '@krdata/hira';

import { toKrDataEnvelope } from '../common/krdata-envelope';
import { MirrorListCommand } from '../common/mirror.result';

/**
 * HIRA 원본 미러 조회.
 *
 * **원본 API 와 똑같은 구조로 응답한다.** DB 의 JSON 이 곧 원본 item 이므로,
 * 그것을 item 타입으로 읽어 원본 봉투에 담아 돌려준다.
 *
 * 통합 병원 조회는 여기가 아니라 HealthcareHospitalService 다 — 그쪽은 우리 스키마로,
 * 여기는 원본 그대로. 두 관심사를 한 서비스에 섞지 않는다.
 */
@Injectable()
export class HiraHospitalService {
  constructor(private readonly prisma: PrismaService) {}

  async listHospitals(
    command: MirrorListCommand,
  ): Promise<HospitalListResponse> {
    const [rows, totalCount] = await Promise.all([
      this.prisma.hira_hospital.findMany({
        orderBy: { ykiho: 'asc' },
        skip: (command.page - 1) * command.size,
        take: command.size,
      }),
      this.prisma.hira_hospital.count(),
    ]);

    return toKrDataEnvelope<HospitalItem>({
      items: rows.map((row) => row.data as HospitalItem),
      pageNo: command.page,
      numOfRows: command.size,
      totalCount,
    });
  }

  /** 1건 조회. 없으면 items 가 빈 배열이고 totalCount 가 0 이다 (원본 API 와 같은 규칙). */
  async getHospital(ykiho: string): Promise<HospitalListResponse> {
    const row = await this.prisma.hira_hospital.findUnique({
      where: { ykiho },
    });

    return toKrDataEnvelope<HospitalItem>({
      items: row ? [row.data as HospitalItem] : [],
      pageNo: 1,
      numOfRows: row ? 1 : 0,
      totalCount: row ? 1 : 0,
    });
  }
}
