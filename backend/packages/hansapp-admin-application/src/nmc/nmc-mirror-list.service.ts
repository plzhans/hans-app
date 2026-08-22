import { Injectable } from '@nestjs/common';
import { Page } from '@hansapp/common';
import type { NmcHospital } from '@hansapp/data';

import { NmcMirrorListRepository, type NmcMirrorListFilter } from './nmc-mirror-list.repository';

export interface NmcMirrorListQuery extends NmcMirrorListFilter {
  page: number;
  size: number;
}

/** 목록 한 행. data(JSON) 에서 이름·주소·전화만 뽑고 나머지는 상세에서 본다. */
export interface NmcMirrorListRow {
  hpid: string;
  name: string | null;
  addr: string | null;
  tel: string | null;
  sidoNm: string | null;
  sgguNm: string | null;
  dutyDiv: string | null;
  syncedAt: string;
}

@Injectable()
export class NmcMirrorListService {
  constructor(private readonly repo: NmcMirrorListRepository) {}

  async list(query: NmcMirrorListQuery): Promise<Page<NmcMirrorListRow>> {
    const { rows, total } = await this.repo.list(query, query.page, query.size);
    return new Page(rows.map(toRow), query.page, query.size, total);
  }
}

function toRow(hospital: NmcHospital): NmcMirrorListRow {
  const data = hospital.data as Record<string, unknown>;
  return {
    hpid: hospital.hpid,
    name: typeof data.dutyName === 'string' ? data.dutyName : null,
    addr: typeof data.dutyAddr === 'string' ? data.dutyAddr : null,
    tel: typeof data.dutyTel1 === 'string' ? data.dutyTel1 : null,
    sidoNm: hospital.sidoNm,
    sgguNm: hospital.sgguNm,
    dutyDiv: hospital.dutyDiv,
    syncedAt: hospital.syncedAt.toISOString(),
  };
}
