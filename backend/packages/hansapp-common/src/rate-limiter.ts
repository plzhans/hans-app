/**
 * 초당 호출 수를 제한한다. 단건 조회를 수만 번 두드리는 루프에서 쓴다.
 *
 * **게이트웨이가 초당 50콜에서 거절한다**(코드 23 / HTTP 429). 응답 헤더가 그 값을 직접
 * 말해 준다 — `x-ratelimit-limit=50 x-ratelimit-remaining=0`. 개별 상세 단계는 워커
 * 여럿이 병원 하나당 오퍼레이션을 연달아 불러서 그 선을 쉽게 넘는다.
 *
 * **재시도로는 못 막는다.** 코드 23 은 판정이 retry 지만, 다시 부를 때도 다른 워커가 같이
 * 몰려 있어 다음 창에서 또 걸린다. 운영의 nmc.3 이 세 번을 다시 부르고도 전부 429 였다.
 *
 * **쓰는 자리를 좁게 둔다.** 클라이언트 밑바닥에 깔면 모든 호출이 지나긴 하지만, 정작
 * 터지는 곳은 단건 루프 두 곳뿐인데 어디서 조여지는지가 코드에서 안 보이게 된다.
 * 몰아치는 루프가 스스로 하나 들고 쓰는 편이 읽힌다.
 *
 * ```ts
 * const limiter = new RateLimiter(KRDATA_CALLS_PER_SECOND);
 * await mapWithConcurrency(targets, CONCURRENCY, async (id) => {
 *   await limiter.acquire();
 *   await this.fetchAndStore(id);
 * });
 * ```
 */
export class RateLimiter {
  /**
   * 최근 한 창에 나간 호출 시각. 오래된 것부터 빠지므로 앞이 가장 이르다.
   * 길이가 상한을 넘지 않으므로 잘라내기 비용도 상한만큼이다.
   */
  private readonly sent: number[] = [];

  /**
   * 자리를 잡는 동안 다른 호출이 끼어들지 못하게 하는 줄.
   *
   * **빈자리 확인과 기록 사이에 await 가 있어서 필요하다.** 기다렸다 깨어난 호출이 자기
   * 자리를 적기 전에 다른 호출이 같은 빈자리를 보면 둘 다 통과해 상한을 넘는다
   * (mapWithConcurrency 의 `calls += await` 가 어긋났던 것과 같은 모양이다).
   */
  private queue: Promise<void> = Promise.resolve();

  /**
   * @param maxPerSecond 1초에 허용할 호출 수
   * @param windowMs 창의 길이. 바꿀 일은 없고 테스트가 줄여 쓴다
   */
  constructor(
    private readonly maxPerSecond: number,
    private readonly windowMs = 1_000,
  ) {
    if (maxPerSecond < 1) {
      throw new Error(`RateLimiter needs at least 1 call per second (got ${maxPerSecond})`);
    }
  }

  /**
   * 나갈 자리가 생길 때까지 기다린다. 호출 직전에 부른다.
   *
   * **자리는 시간이 풀지 응답이 풀지 않는다.** 창이 지나면 저절로 빠지므로 느린 응답이
   * 자리를 물고 있지 않는다 — 동시에 떠 있는 요청 수는 예전처럼 호출부가 정한다.
   *
   * 루프는 반드시 끝난다. 가장 이른 기록이 창을 벗어날 때까지만 자고 깨므로, 그다음
   * 잘라내기가 적어도 하나를 버린다.
   */
  acquire(): Promise<void> {
    const turn = this.queue.then(async () => {
      for (;;) {
        const now = Date.now();
        this.evict(now);

        if (this.sent.length < this.maxPerSecond) {
          this.sent.push(now);
          return;
        }

        await sleep(this.windowMs - (now - this.sent[0]));
      }
    });

    // 줄은 끊기면 안 된다. 앞 사람이 실패해도 뒷사람 차례는 와야 한다.
    this.queue = turn.catch(() => undefined);
    return turn;
  }

  private evict(now: number): void {
    while (this.sent.length > 0 && now - this.sent[0] >= this.windowMs) {
      this.sent.shift();
    }
  }
}

/**
 * 공공데이터포털 단건 루프가 쓰는 값. **게이트웨이의 50 보다 낮게 둔다.**
 *
 * RateLimiter 가 지키는 것은 "발신 시각 기준 어떤 1초 창에도 이 값을 넘지 않는다" 이고,
 * 이건 진짜 슬라이딩 창이라 창 경계를 어떻게 잡든 성립한다. 그런데도 50 을 그대로 쓰지
 * 않는 이유가 셋이다.
 *
 *  - **우리는 보낸 시각을 세고 게이트웨이는 도착한 시각을 센다.** 지터가 고르지 않으면
 *    600ms 에 걸쳐 내보낸 40건이 저쪽에는 300ms 안에 몰려 도착한다.
 *  - **허가한 시각과 실제로 나가는 시각이 한 틱 어긋난다.** 자리를 내주는 것은 여기지만
 *    부르는 쪽은 await 에서 깨어난 뒤에 호출한다. 그 사이 이벤트 루프가 한 바퀴 돌면
 *    발신이 1~2ms 밀려 창 경계에서 한두 개가 겹친다.
 *  - **리미터는 루프마다 하나씩이다.** 배치가 도는 중에 hanscli 로 단계를 돌리면 둘이
 *    각자 이만큼 낸다. 합쳐서 50 을 넘지 않을 여지를 남긴다.
 */
export const KRDATA_CALLS_PER_SECOND = 40;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
