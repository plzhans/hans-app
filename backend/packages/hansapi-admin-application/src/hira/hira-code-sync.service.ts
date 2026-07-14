import { Injectable, Logger } from '@nestjs/common';
import {
  asString,
  HIRA_CODE_TYPE_DEFS,
  HIRA_CODE_TYPES,
  type HiraCodeType,
} from '@hansapi/application';
import { PrismaService } from '@hansapi/data';

import {
  CodeSyncOptions,
  CodeSyncResult,
  DEFAULT_CODE_SYNC_ROWS,
} from '../common/code-sync.types';
import { CodeRow, upsertCodeRows } from '../common/code-upsert';
import { HIRA_CODE_FETCHERS } from './hira-code.fetchers';
import { HiraQueryService } from './hira-query.service';

const KEY_COLUMNS = ['tp', 'cd'] as const;
const VALUE_COLUMNS = ['tp_nm', 'cd_nm', 'cd_cmt'] as const;

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
 */
@Injectable()
export class HiraCodeSyncService {
  private readonly logger = new Logger(HiraCodeSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
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

  private async syncType(
    tp: HiraCodeType,
    rows?: number,
  ): Promise<CodeSyncResult> {
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
        `HIRA 코드[${tp}] page=${pageNo} rows=${items.length} 누적=${fetched}/${totalCount}`,
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

  private async upsert(
    tp: HiraCodeType,
    tpNm: string,
    items: unknown[],
  ): Promise<number> {
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
      this.logger.warn(`[${tp}] 코드값이 없어 건너뛴 항목 ${skipped}건`);
    }

    return upsertCodeRows(
      this.prisma,
      'hira_code',
      KEY_COLUMNS,
      VALUE_COLUMNS,
      rows,
    );
  }
}
