import { Injectable, Logger } from '@nestjs/common';
import type { StandardRegionCodeRow } from '@krdata/mois';

import { MoisRegionSyncRepository, RegionCodeRow } from './mois-region-sync.repository';
import { MoisQueryService } from './mois-query.service';

/**
 * 기존 데이터를 어떻게 덮어쓸 것인가.
 *
 *   merge    받은 행을 upsert 하고, 안 온 행에 removed_at 을 찍는다. **기본값이다.**
 *   replace  전량을 받아 놓고 통째로 지운 뒤 다시 넣는다. 한 트랜잭션이다.
 *
 * **왜 merge 가 기본인가.**
 * created_at 이 "언제부터 이 코드가 있었나", updated_at 이 "언제 값이 바뀌었나"를 답한다.
 * replace 는 매 실행마다 그 둘을 오늘로 리셋해서, 행정구역 개편이 언제 반영됐는지
 * 되짚을 수 없게 만든다. 그리고 폐지된 코드가 흔적 없이 사라진다 —
 * 병원 주소가 폐지된 동을 가리킬 때 이름을 붙일 방법이 없어진다.
 *
 * **replace 가 필요한 때.**
 * 미러가 오염됐거나(수동 UPDATE 사고, 중단된 적재), 컬럼 의미가 바뀌어 옛 행의 값을
 * 믿을 수 없을 때다. 그때만 사람이 CLI 로 명시적으로 고른다. 배치는 절대 쓰지 않는다.
 */
export const REGION_SYNC_MODES = ['merge', 'replace'] as const;
export type RegionSyncMode = (typeof REGION_SYNC_MODES)[number];

export interface RegionSyncOptions {
  /** 덮어쓰기 정책. 기본 merge. */
  mode?: RegionSyncMode;

  /** 한 페이지 결과 수. 생략하면 상한(1,000)이다. 낮출 이유는 사실상 없다. */
  numOfRows?: number;
}

export interface RegionSyncResult {
  mode: RegionSyncMode;

  /** API 가 보고한 전체 건수 */
  totalCount: number;

  /** 실제로 가져온 건수 */
  fetched: number;

  /** DB 에 반영한 건수 */
  upserted: number;

  /** 이번에 폐지로 표시한 건수. replace 모드는 항상 0 이다(지우고 다시 넣으므로). */
  removed: number;

  /** 호출한 API 페이지 수 */
  pages: number;

  /** 적재 후 살아 있는 행 수 */
  alive: number;

  /** 레벨별 건수. 세종처럼 원본이 규칙을 벗어나는 경우를 눈으로 확인하는 용도다. */
  levels: Record<RegionLevel, number>;

  elapsedMs: number;
}

/** 지역 단계. 코드 자릿수에서 파생한다. */
export const REGION_LEVELS = ['sido', 'sggu', 'umd', 'ri'] as const;
export type RegionLevel = (typeof REGION_LEVELS)[number];

/**
 * 행정안전부 법정동코드를 로컬 DB(mois_region_code)에 미러링한다.
 *
 * **배치에서 가장 먼저 도는 적재다.** 지역은 HIRA·NMC 를 우리 코드로 옮길 때의 기준이라,
 * 정본이 낡은 채로 병원을 적재하면 새로 생긴 행정구역의 병원이 지역 없이 쌓인다.
 *
 * 전량 20,560건이 21콜이라 항상 전체를 받는다(개발계정 한도 10,000의 0.2%).
 * 부분 적재 옵션(--full 같은)을 두지 않는 이유다 — 나눠 받을 이유가 없고,
 * 나눠 받으면 스윕이 못 온 페이지를 폐지로 오인한다.
 */
@Injectable()
export class MoisRegionSyncService {
  private readonly logger = new Logger(MoisRegionSyncService.name);

  constructor(
    private readonly repo: MoisRegionSyncRepository,
    private readonly api: MoisQueryService,
  ) {}

  async sync(options: RegionSyncOptions = {}): Promise<RegionSyncResult> {
    const mode = options.mode ?? 'merge';
    const startedAt = new Date();
    const startedMs = Date.now();

    const rows: RegionCodeRow[] = [];
    const levels: Record<RegionLevel, number> = {
      sido: 0,
      sggu: 0,
      umd: 0,
      ri: 0,
    };

    let totalCount = 0;
    let fetched = 0;
    let upserted = 0;
    let pages = 0;

    for await (const page of this.api.streamRegionCodes({}, options.numOfRows)) {
      pages += 1;
      totalCount = page.totalCount;
      fetched += page.rows.length;

      const converted = page.rows.map((row) => toRow(row));
      for (const row of converted) {
        levels[row.level as RegionLevel] += 1;
      }

      // merge 는 페이지마다 바로 넣는다 — 중간에 죽어도 받은 데까지 최신이다.
      // replace 는 전량을 모아 뒀다가 한 트랜잭션에 넣는다. 받으면서 지우면
      // 트랜잭션이 API 응답을 기다리는 동안 열려 있게 된다.
      if (mode === 'merge') {
        upserted += await this.repo.upsert(converted);
      } else {
        rows.push(...converted);
      }

      this.logger.log(
        `Legal district codes page=${pages} rows=${page.rows.length} total=${fetched}/${totalCount}`,
      );
    }

    if (mode === 'replace') {
      upserted = await this.repo.replaceAll(rows);
    }

    const removed = await this.sweep(mode, startedAt, fetched, totalCount);

    return {
      mode,
      totalCount,
      fetched,
      upserted,
      removed,
      pages,
      alive: await this.repo.countAlive(),
      levels,
      elapsedMs: Date.now() - startedMs,
    };
  }

  /**
   * 이번에 안 온 행을 폐지로 표시한다.
   *
   * **전량을 다 받았을 때만 돈다.** 21콜 중간에 끊긴 뒤 스윕하면 못 받은 페이지가 통째로
   * 폐지로 찍힌다. 원본이 보고한 totalCount 와 실제로 받은 건수를 대조해서 판정한다.
   *
   * replace 모드는 스윕하지 않는다. 이미 지우고 다시 넣어서 남을 행이 없다.
   */
  private async sweep(
    mode: RegionSyncMode,
    startedAt: Date,
    fetched: number,
    totalCount: number,
  ): Promise<number> {
    if (mode === 'replace') {
      return 0;
    }

    if (totalCount === 0 || fetched < totalCount) {
      this.logger.warn(
        `Did not receive the full set (${fetched}/${totalCount}). Skipping the retirement pass — ` +
          'keeping stale rows is better than marking rows we never received as retired.',
      );
      return 0;
    }

    const removed = await this.repo.markRemoved(startedAt);
    if (removed > 0) {
      this.logger.log(`Marked ${removed} codes as retired after they vanished from the source.`);
    }
    return removed;
  }
}

/** 원본 행을 DB 컬럼으로 옮긴다. 값은 정규화만 하고 해석하지 않는다. */
function toRow(row: StandardRegionCodeRow): RegionCodeRow {
  const regionCd = text(row.region_cd) ?? '';
  const sidoCd = text(row.sido_cd) ?? regionCd.slice(0, 2);
  const sggCd = text(row.sgg_cd) ?? regionCd.slice(2, 5);
  const umdCd = text(row.umd_cd) ?? regionCd.slice(5, 8);
  const riCd = text(row.ri_cd) ?? regionCd.slice(8, 10);

  return {
    region_cd: regionCd,
    sido_cd: sidoCd,
    sgg_cd: sggCd,
    umd_cd: umdCd,
    ri_cd: riCd,
    locatadd_nm: text(row.locatadd_nm) ?? '',
    locallow_nm: text(row.locallow_nm),
    level: toLevel(sggCd, umdCd, riCd),
    locathigh_cd: text(row.locathigh_cd),
    locatjumin_cd: text(row.locatjumin_cd),
    locatjijuk_cd: text(row.locatjijuk_cd),
    locat_order: typeof row.locat_order === 'number' ? row.locat_order : null,
    locat_rm: text(row.locat_rm),
    adpt_de: text(row.adpt_de),
  };
}

/**
 * 코드 자릿수로 단계를 판정한다. 하위 자리가 0 이면 그 단계 자체를 가리킨다.
 *
 * **원본이 이 규칙을 벗어나는 행이 있다.** 세종특별자치시(3611000000)는 시군구 자리가
 * 채워져 있어 sggu 로 판정된다 — 즉 이 컬럼만으로 시도 목록을 만들면 세종이 빠진다.
 * 여기서 보정하지 않는 이유는 미러가 원본을 그대로 비추는 자리이기 때문이다.
 * 보정은 우리 테이블(region_code)로 승격할 때 한다.
 */
function toLevel(sggCd: string, umdCd: string, riCd: string): RegionLevel {
  if (riCd !== '00') {
    return 'ri';
  }
  if (umdCd !== '000') {
    return 'umd';
  }
  return sggCd === '000' ? 'sido' : 'sggu';
}

/**
 * 빈 값을 NULL 로 맞춘다.
 *
 * 원본은 "없음"을 빈 문자열로도 **공백 한 칸**으로도 준다 — locat_rm 이 공백인 행이
 * 6,992건이다. 그대로 두면 "비고가 있는 행"을 셀 때마다 틀린다.
 * 숫자로 오는 코드 필드가 섞여 있어 문자열로 강제한다(MySQL 이 VARCHAR 바인딩을 거부한다).
 */
function text(value: unknown): string | null {
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value !== 'string') {
    // 객체·배열이 오면 버린다. "[object Object]" 를 컬럼에 넣는 것보다 NULL 이 낫다.
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
