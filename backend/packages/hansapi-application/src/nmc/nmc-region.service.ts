import { Injectable } from '@nestjs/common';
import { PrismaService } from '@hansapi/data';

import { toKrDataEnvelope } from '../common/krdata-envelope';
import { MirrorListCommand } from '../common/mirror.result';

/**
 * 지역 목록 item.
 *
 * 원본 API 에 대응이 없다. NMC 코드마스터의 지역 코드는 행정개편 미반영이고(전남광주통합특별시가
 * 없다), 시군구는 행정구역이 아니라 권역 그룹이라 실제 주소의 32% 를 못 덮는다.
 * 그래서 병원 데이터에서 집계해 만든다. 필드명은 병원 item 의 파생 필드와 맞춘다.
 */
export interface NmcRegionItem {
  sidoNm: string;
  sgguNm?: string;
  hospitalCount: number;
}

/**
 * NMC 지역 목록 조회. nmc_region(병원 데이터 집계)을 읽는다.
 *
 * 응답 봉투는 원본 API 와 같은 구조다. /data-go-kr 아래 응답은 출처를 가리지 않고 형태가 같다.
 */
@Injectable()
export class NmcRegionService {
  constructor(private readonly prisma: PrismaService) {}

  async listRegions(command: MirrorListCommand) {
    const [rows, totalCount] = await Promise.all([
      this.prisma.nmc_region.findMany({
        orderBy: [{ sido_nm: 'asc' }, { sggu_nm: 'asc' }],
        skip: (command.page - 1) * command.size,
        take: command.size,
      }),
      this.prisma.nmc_region.count(),
    ]);

    const items: NmcRegionItem[] = rows.map((row) => ({
      sidoNm: row.sido_nm,
      sgguNm: row.sggu_nm ?? undefined,
      hospitalCount: row.hospital_cnt,
    }));

    return toKrDataEnvelope({
      items,
      pageNo: command.page,
      numOfRows: command.size,
      totalCount,
    });
  }
}
