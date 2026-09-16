/** 한 실행에서 시간을 쓰는 자리. 로그가 "지금 뭘 하는 중인가" 를 답하게 하는 어휘다. */
export type SyncPhase =
  /** 원본 API 응답을 기다리는 시간. 우리가 못 줄이는 쪽이다. */
  | 'api'
  /** DB 에 쓰는 시간. 배치 크기·인덱스가 여기에 나타난다. */
  | 'db'
  /** 우리 프로세스 안의 계산(매칭·집계·변환). */
  | 'calc';

const ORDER: readonly SyncPhase[] = ['api', 'db', 'calc'];

/**
 * 구간별 소요를 재서 한 줄로 요약한다.
 *
 * **긴 적재에서 제일 답답한 것이 "조용한 20초가 뭐였나" 다.** 끝난 뒤 한 줄만 찍으면
 * 원본을 기다린 것인지 우리 DB 가 느린 것인지 구별할 수 없고, 느려졌을 때 어디를 봐야
 * 하는지도 알 수 없다. 재는 비용이 Date.now() 두 번이라 아낄 이유가 없다.
 *
 * ```ts
 * const timer = new SyncTimer();
 * const page = await timer.measure('api', () => client.getList({ pageNo }));
 * await timer.measure('db', () => repo.upsert(rows));
 * logger.log(`subject 3/40 ... ${timer.summary()}`);   // api 8.2s · db 1.1s
 * ```
 */
export class SyncTimer {
  private readonly spent = new Map<SyncPhase, number>();

  /** 한 구간을 재면서 돌린다. 던져도 잰 시간은 남는다 — 실패한 호출도 시간을 썼다. */
  async measure<T>(phase: SyncPhase, body: () => Promise<T>): Promise<T> {
    const startedAt = Date.now();
    try {
      return await body();
    } finally {
      this.spent.set(phase, (this.spent.get(phase) ?? 0) + (Date.now() - startedAt));
    }
  }

  /** 잰 것이 있는 구간만 순서대로. 아무것도 안 쟀으면 빈 문자열이다. */
  summary(): string {
    return ORDER.filter((phase) => this.spent.has(phase))
      .map((phase) => `${phase} ${format(this.spent.get(phase) as number)}`)
      .join(' · ');
  }

  /** 다음 단위(과목·페이지 등)를 재기 전에 비운다. */
  reset(): void {
    this.spent.clear();
  }
}

/** 1초 미만은 ms, 1분 미만은 s, 그 위는 m s. 자릿수를 맞춰 눈으로 비교되게 한다. */
function format(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  return `${minutes}m${Math.round((ms % 60_000) / 1000)}s`;
}
