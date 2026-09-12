import { Injectable, Logger } from '@nestjs/common';

import { healthcareHospitalControllerScroll, type HospitalSummaryDto } from '@hans-api/sdk';

import { TIERS, type Tier } from './sitemap-plan';

/** 한 번에 받아 올 개수. 서버가 100 을 상한으로 두고 있어 그보다 크면 400 이다. */
const PAGE_SIZE = 100;

/** 무한 루프 방지. 9만 건 / 100 = 900회라 여유를 두고 잡는다. */
const MAX_PAGES = 3000;

/**
 * **기본 조회에서 빠지는 등급.**
 *
 * 서버는 tier 를 비워 두면 NURSING·MENTAL 을 제외한다 — 장기 입원 시설이라 외래 검색에
 * 섞이면 방해라서다. 사이트맵은 검색 결과가 아니라 **사이트에 실재하는 문서의 목록**이고
 * 이 병원들도 상세 페이지가 있으므로, 따로 한 번 더 훑어서 채운다.
 */
const EXCLUDED_BY_DEFAULT: readonly Tier[] = ['NURSING', 'MENTAL'];

export interface CollectedHospital {
  id: number;
  /** 내용이 마지막으로 바뀐 시각(ISO 8601). 그대로 lastmod 가 된다. */
  updatedAt: string;
}

export type CollectedByTier = Record<Tier, CollectedHospital[]>;

/**
 * 얼마나 받았는지 알린다. **한 페이지(100건)마다 부른다** — 전량이 몇 분씩 걸리는데
 * 그동안 아무 소리가 없으면 멈춘 것과 구분되지 않는다.
 *
 * 그리는 일은 부르는 쪽(CLI)이 한다. 이 계층은 숫자만 넘긴다 — 터미널인지 로그 파일인지에
 * 따라 한 줄을 갱신할지 여러 줄을 쌓을지가 갈리는데, 그건 출력하는 쪽이 아는 사정이다.
 */
export type CollectProgress = (received: number, done: boolean) => void;

/**
 * 병원 전량을 훑어 tier 로 나눈다.
 *
 * **두 번 훑는다.** 기본 조회가 NURSING·MENTAL 을 빼기 때문이고, 그 둘 말고는 tier 로
 * 나눠 부르지 않는다 — 목록 항목이 자기 tier 를 달고 오므로 한 번 훑으면서 나누면 되고,
 * 그편이 호출도 적다.
 *
 * page/size 가 아니라 커서(nextToken)를 쓴다. 9만 건을 offset 으로 넘기면 깊은 페이지에서
 * 급격히 느려진다.
 */
@Injectable()
export class HospitalCollectorService {
  private readonly logger = new Logger(HospitalCollectorService.name);

  /**
   * @param limit 받아 올 최대 건수. 개발용이다 — 전량은 900회 남짓 걸리는데,
   *              파일 모양만 확인하려고 매번 그걸 다 돌릴 이유가 없다.
   */
  async collect(limit?: number, onProgress?: CollectProgress): Promise<CollectedByTier> {
    const result: CollectedByTier = {
      TIER3: [],
      TIER2: [],
      TIER1: [],
      NURSING: [],
      MENTAL: [],
    };

    // 기본 조회. TIER1·TIER2·TIER3 가 여기서 다 나온다.
    let received = await this.scrollInto(result, undefined, 0, limit, onProgress);
    // 빠진 둘을 채운다.
    received = await this.scrollInto(
      result,
      EXCLUDED_BY_DEFAULT.join(','),
      received,
      limit,
      onProgress,
    );

    // 마지막 한 번. 부르는 쪽이 진행 표시를 정리하고 다음 줄로 넘어갈 자리다.
    onProgress?.(received, true);

    for (const tier of TIERS) {
      this.logger.log(`${tier} ${result[tier].length}`);
    }
    this.logger.log(`합계 ${received}`);

    return result;
  }

  /**
   * 커서를 끝까지 따라가며 tier 별로 담는다. 이미 받은 건수를 물려받아 이어서 센다 —
   * limit 이 두 번의 훑기에 걸쳐 하나의 상한으로 동작해야 하기 때문이다.
   */
  private async scrollInto(
    into: CollectedByTier,
    tier: string | undefined,
    alreadyReceived: number,
    limit?: number,
    onProgress?: CollectProgress,
  ): Promise<number> {
    let nextToken: string | undefined;
    let received = alreadyReceived;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      if (limit !== undefined && received >= limit) {
        return received;
      }

      const response = await healthcareHospitalControllerScroll({
        size: PAGE_SIZE,
        nextToken,
        tier,
      });
      // 스펙상 items 가 제네릭이라 unknown[][] 으로 떨어진다. 이 엔드포인트의 실제 요소로 좁힌다.
      const items = (response.items ?? []) as unknown as HospitalSummaryDto[];

      for (const item of items) {
        const code = item.tier?.code as Tier | undefined;
        // tier 가 없는 병원은 사이트맵에서 뺀다. 어느 파일에 넣을지 정할 수 없고,
        // 임의로 한 곳에 몰면 그 파일의 의미가 흐려진다.
        if (!code || !(code in into)) continue;
        into[code].push({ id: item.id, updatedAt: item.updatedAt });
      }

      received += items.length;
      onProgress?.(received, false);

      nextToken = response.nextToken;
      if (!nextToken || items.length === 0) {
        return received;
      }
    }

    throw new Error(`scroll did not terminate within ${MAX_PAGES} pages (received ${received}).`);
  }
}
