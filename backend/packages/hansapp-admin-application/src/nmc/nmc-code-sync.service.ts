import { Injectable, Logger } from '@nestjs/common';
import { asString } from '@hansapp/application';
import type { CodeInfoItem } from '@krdata/nmc';

import { CodeRow } from '../common/code-upsert';
import { CodeSyncOptions, CodeSyncResult, DEFAULT_CODE_SYNC_ROWS } from '../common/code-sync.types';
import { NmcCodeSyncRepository } from './nmc-code-sync.repository';
import { NmcQueryService } from './nmc-query.service';

/**
 * NMC 코드마스터(CodeMast/info)를 로컬 DB(nmc_code)에 미러링한다.
 *
 * NMC 는 코드 체계가 하나뿐이라 원본 필드명(cmMid/cmSid/cmMnm/cmSnm)을 컬럼으로 그대로 쓴다.
 * 전체가 수백 건이라 한 번에 다 받는다.
 */
@Injectable()
export class NmcCodeSyncService {
  private readonly logger = new Logger(NmcCodeSyncService.name);

  constructor(
    private readonly repo: NmcCodeSyncRepository,
    private readonly api: NmcQueryService,
  ) {}

  async sync(options: CodeSyncOptions = {}): Promise<CodeSyncResult> {
    const numOfRows = options.numOfRows ?? DEFAULT_CODE_SYNC_ROWS;
    const startedAt = Date.now();

    let totalCount = 0;
    let fetched = 0;
    let upserted = 0;
    let pages = 0;
    let pageNo = 1;

    for (;;) {
      const response = await this.api.getCodeList({ pageNo, numOfRows });
      const body = response.response?.body;
      const items = body?.items?.item ?? [];
      totalCount = body?.totalCount ?? 0;
      pages += 1;

      if (items.length === 0) {
        break;
      }

      upserted += await this.upsert(items);
      fetched += items.length;

      this.logger.log(`NMC 코드 page=${pageNo} rows=${items.length} 누적=${fetched}/${totalCount}`);

      if (fetched >= totalCount) {
        break;
      }
      pageNo += 1;
    }

    return {
      tp: 'code',
      totalCount,
      fetched,
      upserted,
      pages,
      elapsedMs: Date.now() - startedAt,
    };
  }

  /** 대·소분류 코드가 PK 다. 둘 중 하나라도 없으면 행을 만들 수 없어 건너뛴다. */
  private async upsert(items: CodeInfoItem[]): Promise<number> {
    const rows: CodeRow[] = [];

    for (const item of items) {
      // 원본은 코드값을 숫자로도 준다(예: cmSid=100, cmSnm=24). 스펙상 타입은 문자열이지만
      // 실제 응답을 믿을 수 없으므로 값을 문자열로 강제한다. 숫자를 그대로 바인딩하면
      // MySQL 이 VARCHAR 컬럼에 대한 파라미터 변환을 거부한다(3988).
      const cmMid = asString(item.cmMid);
      const cmSid = asString(item.cmSid);
      if (cmMid === null || cmSid === null) {
        continue;
      }
      rows.push({
        cm_mid: cmMid,
        cm_sid: cmSid,
        cm_mnm: asString(item.cmMnm),
        cm_snm: asString(item.cmSnm),
      });
    }

    const skipped = items.length - rows.length;
    if (skipped > 0) {
      this.logger.warn(`cmMid/cmSid 가 없어 건너뛴 항목 ${skipped}건`);
    }

    return this.repo.upsertCodes(rows);
  }
}
