import { Injectable, Logger } from '@nestjs/common';
import {
  asString,
  HIRA_CODE_TYPE_DEFS,
  HIRA_CODE_TYPES,
  type HiraCodeType,
} from '@hansapp/application';
import { CodeSyncOptions, CodeSyncResult, DEFAULT_CODE_SYNC_ROWS } from '../common/code-sync.types';
import { CodeRow } from '../common/code-upsert';
import { HiraCodeSyncRepository } from './hira-code-sync.repository';
import { HIRA_CODE_FETCHERS } from './hira-code.fetchers';
import { HiraQueryService } from './hira-query.service';

export interface HiraCodeSyncOptions extends CodeSyncOptions {
  /** 특정 종류만 적재한다. 생략하면 6종 전부. */
  tp?: HiraCodeType;
}

/**
 * HIRA 코드(codeInfoService 6종)를 로컬 DB(hira_code)에 미러링한다.
 *
 * 원본은 종류마다 엔드포인트가 따로지만, 우리는 한 테이블에 tp 로 구분해 담는다.
 * 필드명도 원본이 제각각(addrCd/clCd/…)이라 cd/cd_nm/cd_cmt 로 통일한다.
 * 원본 필드명은 조회 시점에 HIRA_CODE_TYPE_DEFS 로 되돌린다.
 *
 * **hira_code 에는 시드가 채우는 tp 도 있다**(asm·asmgrp — API 가 코드표를 안 주는 것).
 * 여기는 HIRA_CODE_TYPES(6종)만 돌므로 지금은 구조적으로 안 겹친다.
 * "원본에서 사라진 코드 정리" 같은 걸 나중에 넣는다면 **반드시 tp 를 이 6종으로 한정하라** —
 * 한정하지 않으면 HiraCodeSeedService 가 넣은 행이 조용히 날아간다.
 */
@Injectable()
export class HiraCodeSyncService {
  private readonly logger = new Logger(HiraCodeSyncService.name);

  constructor(
    private readonly repo: HiraCodeSyncRepository,
    private readonly api: HiraQueryService,
  ) {}

  /** 지정한 종류(없으면 6종 전부)를 적재한다. */
  async sync(options: HiraCodeSyncOptions = {}): Promise<CodeSyncResult[]> {
    const targets = options.tp ? [options.tp] : [...HIRA_CODE_TYPES];
    const results: CodeSyncResult[] = [];

    for (const tp of targets) {
      results.push(await this.syncType(tp, options.numOfRows));
    }

    return results;
  }

  private async syncType(tp: HiraCodeType, rows?: number): Promise<CodeSyncResult> {
    const numOfRows = rows ?? DEFAULT_CODE_SYNC_ROWS;
    const fetcher = HIRA_CODE_FETCHERS[tp];
    const { tpNm } = HIRA_CODE_TYPE_DEFS[tp];
    const startedAt = Date.now();

    let totalCount = 0;
    let fetched = 0;
    let upserted = 0;
    let pages = 0;
    let pageNo = 1;

    for (;;) {
      const response = await fetcher.fetch(this.api, { pageNo, numOfRows });
      const body = response.response?.body;
      const items = body?.items?.item ?? [];
      totalCount = body?.totalCount ?? 0;
      pages += 1;

      if (items.length === 0) {
        break;
      }

      upserted += await this.upsert(tp, tpNm, items);
      fetched += items.length;

      this.logger.log(
        `HIRA codes[${tp}] page=${pageNo} rows=${items.length} total=${fetched}/${totalCount}`,
      );

      if (fetched >= totalCount) {
        break;
      }
      pageNo += 1;
    }

    return {
      tp,
      totalCount,
      fetched,
      upserted,
      pages,
      elapsedMs: Date.now() - startedAt,
    };
  }

  private async upsert(tp: HiraCodeType, tpNm: string, items: unknown[]): Promise<number> {
    const { toValues } = HIRA_CODE_FETCHERS[tp];
    const rows: CodeRow[] = [];

    for (const item of items) {
      const values = toValues(item);
      // 원본은 코드값을 숫자로도 준다. 문자열로 강제하지 않으면 MySQL 이 VARCHAR 컬럼에 대한
      // 파라미터 변환을 거부한다(3988).
      const cd = asString(values.cd);
      // cd 가 PK 의 일부다. 없으면 행을 만들 수 없다.
      if (cd === null) {
        continue;
      }
      rows.push({
        tp,
        cd,
        tp_nm: tpNm,
        cd_nm: asString(values.cdNm),
        cd_cmt: asString(values.cdCmt),
      });
    }

    const skipped = items.length - rows.length;
    if (skipped > 0) {
      this.logger.warn(`[${tp}] skipped ${skipped} items with no code value`);
    }

    return this.repo.upsertCodes(rows);
  }
}
