import { Injectable } from '@nestjs/common';
import { Page } from '@hansapp/common';
import type { HiraHospital } from '@hansapp/data';

import { HiraMirrorListRepository, type HiraMirrorListFilter } from './hira-mirror-list.repository';

export interface HiraMirrorListQuery extends HiraMirrorListFilter {
  page: number;
  size: number;
}

/** 목록 한 행. data(JSON) 에서 이름·주소·전화만 뽑고 나머지는 상세에서 본다. */
export interface HiraMirrorListRow {
  ykiho: string;
  name: string | null;
  addr: string | null;
  tel: string | null;
  sidoNm: string | null;
  sgguNm: string | null;
  clCd: string | null;
  syncedAt: string;
}

@Injectable()
export class HiraMirrorListService {
  constructor(private readonly repo: HiraMirrorListRepository) {}

  async list(query: HiraMirrorListQuery): Promise<Page<HiraMirrorListRow>> {
    const { rows, total } = await this.repo.list(query, query.page, query.size);
    return new Page(rows.map(toRow), query.page, query.size, total);
  }
}

function toRow(hospital: HiraHospital): HiraMirrorListRow {
  const data = hospital.data as Record<string, unknown>;
  return {
    ykiho: hospital.ykiho,
    name: typeof data.yadmNm === 'string' ? data.yadmNm : null,
    addr: typeof data.addr === 'string' ? data.addr : null,
    tel: typeof data.telno === 'string' ? data.telno : null,
    sidoNm: hospital.sidoNm,
    sgguNm: hospital.sgguNm,
    clCd: hospital.clCd,
    syncedAt: hospital.syncedAt.toISOString(),
  };
}
