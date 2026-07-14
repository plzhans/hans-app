import { Injectable } from '@nestjs/common';
import { PrismaService } from '@hansapi/data';
import type { BabyHospitalListResponse, HospitalListItem } from '@krdata/nmc';

import { toKrDataEnvelope } from '../common/krdata-envelope';
import { MirrorListCommand } from '../common/mirror.result';

/**
 * 달빛어린이병원·소아전문센터 조회.
 *
 * 병원 목록의 부분집합이지만 원본이 별도 API 로 주고 전용 필드(phpid)가 있어 테이블을 나눴다.
 * 평일 18~24시, 주말·공휴일 09~24시 진료라는 성격이 뚜렷해 검색에서 독립적으로 쓰인다.
 *
 * 응답은 원본 API(getBabyListInfoInqire)와 같은 구조다. DB 의 JSON 이 곧 원본 item 이다.
 */
@Injectable()
export class NmcBabyService {
  constructor(private readonly prisma: PrismaService) {}

  async listBabyHospitals(
    command: MirrorListCommand,
  ): Promise<BabyHospitalListResponse> {
    const [rows, totalCount] = await Promise.all([
      this.prisma.nmc_baby_hospital.findMany({
        orderBy: { hpid: 'asc' },
        skip: (command.page - 1) * command.size,
        take: command.size,
      }),
      this.prisma.nmc_baby_hospital.count(),
    ]);

    const items = rows.map((row) => row.data as HospitalListItem);

    return toKrDataEnvelope({
      items,
      pageNo: command.page,
      numOfRows: command.size,
      totalCount,
    });
  }
}
