import { Injectable } from '@nestjs/common';

import { toKrDataEnvelope } from '../common/krdata-envelope';
import { MirrorListCommand } from '../common/mirror.result';
import { HiraRegionRepository } from './hira-region.repository';

/**
 * 지역 목록 item.
 *
 * 원본 API 에 대응이 없다. HIRA 는 시도 코드 목록은 주지만 **시군구 코드 목록 API 가 없다**.
 * 그래서 병원 데이터에서 집계해 만든다. 필드명은 원본 병원 item 의 지역 필드와 맞춘다.
 */
export interface HiraRegionItem {
  sidoCd: string;
  sidoCdNm?: string;
  sgguCd: string;
  sgguCdNm?: string;
  hospitalCount: number;
}

/** HIRA 지역 목록 조회. hira_region(병원 데이터 집계)을 읽는다. */
@Injectable()
export class HiraRegionService {
  constructor(private readonly repo: HiraRegionRepository) {}

  async listRegions(command: MirrorListCommand) {
    const [rows, totalCount] = await Promise.all([
      this.repo.list(command.page, command.size),
      this.repo.count(),
    ]);

    const items: HiraRegionItem[] = rows.map((row) => ({
      sidoCd: row.sidoCd,
      sidoCdNm: row.sidoNm ?? undefined,
      sgguCd: row.sgguCd,
      sgguCdNm: row.sgguNm ?? undefined,
      hospitalCount: row.hospitalCnt,
    }));

    return toKrDataEnvelope({
      items,
      pageNo: command.page,
      numOfRows: command.size,
      totalCount,
    });
  }
}
