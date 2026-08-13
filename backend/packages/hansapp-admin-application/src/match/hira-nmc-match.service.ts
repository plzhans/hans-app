import { Injectable, Logger } from '@nestjs/common';

import { HiraNmcMatchRepository } from './hira-nmc-match.repository';
import { distanceMeters, nameSimilarity, normalizeName, normalizeTel } from './similarity';

/**
 * 판정 임계값. 전부 실측으로 잡았다.
 *
 * 전화+이름이 일치한 71,826쌍의 좌표 거리: 중앙값 2m · p90 57m · p95 185m · p99 2,555m
 * → 절반이 2m 안에 있다(두 기관이 같은 지오코딩을 쓴다). 다만 1%는 좌표가 엉망이라
 *   좌표 단독으로는 못 쓰고 반드시 이름과 함께 본다.
 */
const NEAR_METERS = 100; // 같은 자리로 볼 거리
const NAME_STRONG = 0.75; // 이름이 사실상 같다 → 확정
const NAME_REVIEW = 0.5; // 전화가 안 맞을 때, 이 위면 사람에게 넘긴다
const CANDIDATE_LIMIT = 5; // review 후보를 몇 개까지 남길지

/** 좌표 격자 크기. 약 500m. 전화가 안 맞는 병원의 후보를 찾는 데 쓴다. */
const GRID = 200;

interface HiraRow {
  ykiho: string;
  name: string;
  tel: string;
  lat: number | null;
  lon: number | null;
}

interface NmcRow {
  hpid: string;
  name: string;
  tel: string;
  lat: number | null;
  lon: number | null;
}

export interface Scored {
  hpid: string;
  score: number;
  nameSim: number;
  distance: number | null;

  /** 전화번호가 완전히 일치했나. 판정에서 다시 계산하지 않도록 여기 담아 둔다. */
  telMatch: boolean;
}

/** 한 병원(ykiho)에 대한 판정 결과 한 건. persist 로 넘어가는 저장 payload 다. */
export interface MatchDecision {
  ykiho: string;
  hpid: string | null;
  status: string;
  rule: string | null;
  score: number | null;
  nameSim: number | null;
  distance: number | null;
  candidates: Scored[];
}

export interface MatchOptions {
  /** auto 로 확정된 것도 다시 판정한다. 룰을 고쳤을 때 쓴다. manual 은 그래도 안 건드린다. */
  recheck?: boolean;

  /** DB 를 건드리지 않고 건수만 센다 */
  dryRun?: boolean;
}

export interface MatchResult {
  targets: number;
  auto: number;
  review: number;
  rejected: number;
  noCandidate: number;
  elapsedMs: number;
}

/**
 * HIRA ↔ NMC 병원 매칭.
 *
 * 두 기관은 공통 키가 없다. 이름·전화·좌표로 같은 병원을 찾는다.
 * **API 콜이 0이다.** 매칭 키가 전부 목록 API 에 있어서 1단계만 끝나면 계산으로 끝난다.
 *
 * 8만 × 8만 = 62억 쌍을 전수 비교하지 않는다. 전화번호로 블로킹하면 92.9% 가 1:1 로 걸리고,
 * 나머지만 좌표 격자로 후보를 좁힌다. 실제 비교는 몇 만 번뿐이라 몇 초면 끝난다.
 *
 * 확정(hira_nmc_link)은 재매칭이 건드리지 않는다. 특히 사람이 정한 것(manual)은 절대 안 덮는다.
 */
@Injectable()
export class HiraNmcMatchService {
  private readonly logger = new Logger(HiraNmcMatchService.name);

  constructor(private readonly repo: HiraNmcMatchRepository) {}

  async match(options: MatchOptions = {}): Promise<MatchResult> {
    const startedAt = Date.now();

    const [hira, nmc, links, rejected] = await Promise.all([
      this.loadHira(),
      this.loadNmc(),
      this.repo.loadLinks(),
      this.repo.loadRejected(),
    ]);

    this.logger.log(
      `HIRA ${hira.length.toLocaleString()} · NMC ${nmc.length.toLocaleString()} · 확정 ${links.length.toLocaleString()}`,
    );

    // 확정된 것은 건너뛴다. --recheck 면 auto 만 다시 본다(manual 은 사람이 정한 것이라 그대로).
    const skipYkiho = new Set(
      links
        .filter((link) => !options.recheck || link.confirmedBy === 'manual')
        .map((link) => link.ykiho),
    );
    // 이미 확정에 쓰인 NMC 병원은 후보에서 뺀다. 1:1 이라 두 번 쓰일 수 없다.
    const usedHpid = new Set(
      links
        .filter((link) => !options.recheck || link.confirmedBy === 'manual')
        .map((link) => link.hpid),
    );
    // 거부는 (ykiho, hpid) 쌍이다. 다른 후보가 생기면 다시 검토된다.
    const rejectedPairs = new Set(rejected.map((row) => `${row.ykiho}|${row.hpid ?? ''}`));

    const targets = hira.filter((row) => !skipYkiho.has(row.ykiho));

    // 블로킹 색인. 후보를 좁히지 않으면 62억 쌍을 비교해야 한다.
    const byTel = new Map<string, NmcRow[]>();
    const byGrid = new Map<string, NmcRow[]>();
    for (const row of nmc) {
      if (usedHpid.has(row.hpid)) {
        continue;
      }
      if (row.tel) {
        const list = byTel.get(row.tel);
        if (list) {
          list.push(row);
        } else {
          byTel.set(row.tel, [row]);
        }
      }
      if (row.lat !== null && row.lon !== null) {
        const key = this.gridKey(row.lat, row.lon);
        const list = byGrid.get(key);
        if (list) {
          list.push(row);
        } else {
          byGrid.set(key, [row]);
        }
      }
    }

    const decisions: MatchDecision[] = [];

    // 한 NMC 병원이 두 HIRA 병원에 붙는 것을 막는다(1:1). 먼저 확정된 쪽이 가져간다.
    const claimed = new Set<string>();

    for (const target of targets) {
      const candidates = this.findCandidates(target, byTel, byGrid, rejectedPairs, claimed);
      const decision = this.decide(target, candidates);

      if (decision.status === 'auto' && decision.hpid) {
        claimed.add(decision.hpid);
      }
      decisions.push({ ykiho: target.ykiho, ...decision });
    }

    const result: MatchResult = {
      targets: targets.length,
      auto: decisions.filter((d) => d.status === 'auto').length,
      review: decisions.filter((d) => d.status === 'review').length,
      rejected: decisions.filter((d) => d.status === 'rejected').length,
      noCandidate: decisions.filter((d) => d.status === 'no_candidate').length,
      elapsedMs: Date.now() - startedAt,
    };

    if (!options.dryRun) {
      await this.persist(decisions);
    }

    return { ...result, elapsedMs: Date.now() - startedAt };
  }

  /** 전화 → 후보. 없으면 좌표 격자(이웃 9칸) → 후보. */
  private findCandidates(
    target: HiraRow,
    byTel: Map<string, NmcRow[]>,
    byGrid: Map<string, NmcRow[]>,
    rejectedPairs: Set<string>,
    claimed: Set<string>,
  ): Scored[] {
    const pool = new Map<string, NmcRow>();

    for (const row of (target.tel && byTel.get(target.tel)) || []) {
      pool.set(row.hpid, row);
    }

    if (target.lat !== null && target.lon !== null) {
      const gx = Math.round(target.lat * GRID);
      const gy = Math.round(target.lon * GRID);
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          for (const row of byGrid.get(`${gx + i}:${gy + j}`) ?? []) {
            pool.set(row.hpid, row);
          }
        }
      }
    }

    const scored: Scored[] = [];
    for (const row of pool.values()) {
      if (claimed.has(row.hpid)) {
        continue;
      }
      if (rejectedPairs.has(`${target.ykiho}|${row.hpid}`)) {
        continue;
      }

      const nameSim = nameSimilarity(target.name, row.name);
      const distance =
        target.lat !== null && target.lon !== null && row.lat !== null && row.lon !== null
          ? Math.round(distanceMeters(target.lat, target.lon, row.lat, row.lon))
          : null;
      const telMatch = target.tel !== '' && target.tel === row.tel;

      // 거리 점수: 100m 이내면 1점, 1km 넘으면 0점.
      const near =
        distance === null ? 0 : Math.max(0, 1 - Math.max(0, distance - NEAR_METERS) / 900);

      const score = 0.5 * nameSim + 0.3 * near + (telMatch ? 0.2 : 0);
      scored.push({ hpid: row.hpid, score, nameSim, distance, telMatch });
    }

    return scored.sort((a, b) => b.score - a.score).slice(0, CANDIDATE_LIMIT);
  }

  /**
   * 판정.
   *
   * **자동으로 거부하지 않는다.** rejected 는 사람이 "아니다"라고 한 것만이다.
   *
   * 전화가 1:1 로 일치하는데 이름이 다른 91건을 열어 보니 대부분이 같은 병원이었다.
   *   성모의원      ←→ 성모가정의학과의원    (sim 0.22)   같은 병원
   *   향림마취과의원 ←→ 향림통증의학과의원    (sim 0.27)   같은 병원 (진료과목 표기 차이)
   *   화명하나병원   ←→ 시원항병원           (sim 0.13)   다른 병원
   * 기계가 유사도만 보고 앞의 둘을 버리면 정상 매칭을 잃는다. 사람이 보게 넘긴다.
   *
   * 반대로 좌표만 가까운 것(500m 격자에 우연히 걸린 남의 병원)은 후보가 아니다.
   * 그건 거부가 아니라 **후보 없음**이다. 거부로 기록하면 나중에 진짜 후보가 생겨도
   * 그 쌍이 영원히 배제된다.
   */
  private decide(_target: HiraRow, candidates: Scored[]): Omit<MatchDecision, 'ykiho'> {
    const none = {
      hpid: null,
      status: 'no_candidate',
      rule: null,
      score: null,
      nameSim: null,
      distance: null,
      candidates: [] as Scored[],
    };

    if (candidates.length === 0) {
      return none;
    }

    const best = candidates[0];
    const second = candidates[1];
    const near = best.distance !== null && best.distance <= NEAR_METERS;

    const base = {
      hpid: best.hpid,
      score: best.score,
      nameSim: best.nameSim,
      distance: best.distance,
      candidates,
    };

    // 이름이 사실상 같고, 전화나 좌표 중 하나가 받쳐 준다 → 확정.
    if (best.nameSim >= NAME_STRONG && (best.telMatch || near)) {
      // 2위와 점수가 붙어 있으면 사람이 본다 (같은 이름의 분원 등).
      if (second && best.score - second.score < 0.05) {
        return { ...base, status: 'review', rule: 'ambiguous' };
      }
      return {
        ...base,
        status: 'auto',
        rule: best.telMatch ? 'tel_name' : 'geo_name',
      };
    }

    // 전화가 같다 — 이름이 달라도 사람이 봐야 한다. 자동으로 버리지 않는다.
    if (best.telMatch) {
      return { ...base, status: 'review', rule: 'tel_only' };
    }

    // 전화가 다르고 이름도 애매하다. 가깝고 이름이 어느 정도 닮았을 때만 사람에게 넘긴다.
    if (near && best.nameSim >= NAME_REVIEW) {
      return { ...base, status: 'review', rule: 'geo_only' };
    }

    // 그 외는 후보라고 부를 수 없다. 격자에 우연히 걸린 남의 병원이다.
    return none;
  }

  private gridKey(lat: number, lon: number): string {
    return `${Math.round(lat * GRID)}:${Math.round(lon * GRID)}`;
  }

  private async loadHira(): Promise<HiraRow[]> {
    const rows = await this.repo.loadHiraRows();

    return rows.map((row) => ({
      ykiho: row.ykiho,
      name: normalizeName(row.nm),
      tel: normalizeTel(row.tel),
      lat: row.lat === null ? null : Number(row.lat),
      lon: row.lon === null ? null : Number(row.lon),
    }));
  }

  private async loadNmc(): Promise<NmcRow[]> {
    const rows = await this.repo.loadNmcRows();

    return rows.map((row) => ({
      hpid: row.hpid,
      name: normalizeName(row.nm),
      tel: normalizeTel(row.tel),
      lat: row.lat === null ? null : Number(row.lat),
      lon: row.lon === null ? null : Number(row.lon),
    }));
  }

  /** 판정 결과를 저장한다. link 는 확정된 것만, candidate 는 review 인 것만. */
  private async persist(decisions: MatchDecision[]): Promise<void> {
    const CHUNK = 500;

    for (let i = 0; i < decisions.length; i += CHUNK) {
      const chunk = decisions.slice(i, i + CHUNK);

      await this.repo.upsertMatches(chunk);

      const confirmed = chunk.filter((d) => d.status === 'auto' && d.hpid);
      if (confirmed.length > 0) {
        await this.repo.upsertLinks(confirmed);
      }

      const reviews = chunk.filter((d) => d.status === 'review');
      if (reviews.length > 0) {
        await this.repo.deleteCandidates(reviews.map((d) => d.ykiho));

        const rows = reviews.flatMap((d) =>
          d.candidates.map((c, index) => ({
            ykiho: d.ykiho,
            hpid: c.hpid,
            rank: index + 1,
            score: c.score,
            nameSim: c.nameSim,
            distanceM: c.distance,
          })),
        );
        if (rows.length > 0) {
          await this.repo.createCandidates(rows);
        }
      }
    }
  }

  /** 상태별 집계 (CLI status) */
  async summary(): Promise<{ status: string; count: number }[]> {
    const rows = await this.repo.countByStatus();
    return rows
      .map((row) => ({ status: row.status, count: row._count.status }))
      .sort((a, b) => b.count - a.count);
  }
}
