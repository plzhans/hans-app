import { KRDATA_CALLS_PER_SECOND, RateLimiter } from './rate-limiter';

/** 실제 쓰임(mapWithConcurrency)과 같은 모양의 워커 풀. 그쪽은 상위 패키지라 여기서 못 쓴다. */
async function withWorkers(count: number, jobs: number, body: () => Promise<void>): Promise<void> {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: count }, async () => {
      while (cursor++ < jobs) {
        await body();
      }
    }),
  );
}

/** 창을 짧게 잡아 테스트가 초 단위로 늘어지지 않게 한다. 규칙은 길이와 무관하다. */
const WINDOW_MS = 100;

/** 슬라이딩 창 어디를 잘라도 이 값을 넘으면 안 된다. */
function busiestWindow(stamps: number[], windowMs: number): number {
  const sorted = [...stamps].sort((a, b) => a - b);
  let worst = 0;
  for (let i = 0; i < sorted.length; i++) {
    let n = 0;
    while (i + n < sorted.length && sorted[i + n] - sorted[i] < windowMs) {
      n += 1;
    }
    worst = Math.max(worst, n);
  }
  return worst;
}

describe('RateLimiter', () => {
  it('창이 비어 있으면 상한까지는 기다리지 않는다', async () => {
    const limiter = new RateLimiter(10, WINDOW_MS);
    const startedAt = Date.now();

    await Promise.all(Array.from({ length: 10 }, () => limiter.acquire()));

    expect(Date.now() - startedAt).toBeLessThan(WINDOW_MS);
  });

  it('상한을 넘으면 창이 열릴 때까지 기다린다', async () => {
    const limiter = new RateLimiter(10, WINDOW_MS);
    const startedAt = Date.now();

    await Promise.all(Array.from({ length: 11 }, () => limiter.acquire()));

    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(WINDOW_MS * 0.9);
  });

  /*
    **재는 시각과 허가하는 시각이 한 틱 어긋난다.** 리미터는 자리를 내주는 순간을 창에
    적지만, 부르는 쪽은 await 에서 깨어난 뒤에야 실제로 호출한다. 그 사이에 이벤트 루프가
    한 바퀴 돌면 허가는 제때 났는데 발신이 1~2ms 밀려, 창을 stamp 로 재면 한두 개가 더
    잡힌다. 리미터가 못 지킨 게 아니라 잣대가 다른 것이다.

    상한을 게이트웨이의 50 이 아니라 40 으로 잡은 이유가 여기에도 있다 — 이 정도 밀림은
    그 여유가 흡수한다. 그래서 창당 개수는 여유를 두고 보고, 전체 구간의 평균 속도로
    실제로 조여졌는지를 같이 본다.
  */
  it('한꺼번에 몰려도 창당 개수와 평균 속도가 상한 근처에 머문다', async () => {
    const limiter = new RateLimiter(10, WINDOW_MS);
    const stamps: number[] = [];
    const startedAt = Date.now();

    await Promise.all(
      Array.from({ length: 50 }, async () => {
        await limiter.acquire();
        stamps.push(Date.now());
      }),
    );

    expect(busiestWindow(stamps, WINDOW_MS)).toBeLessThanOrEqual(12);

    // 50건을 10건/창으로 내보내려면 최소 네 창을 기다려야 한다. 안 기다렸으면 안 조인 것이다.
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(WINDOW_MS * 4 * 0.9);
  });

  it('워커가 여럿이어도 상한을 안 넘는다', async () => {
    // 실제 쓰임과 같은 모양이다 — 워커 여럿이 같은 리미터에 몰린다.
    const limiter = new RateLimiter(10, WINDOW_MS);
    const stamps: number[] = [];

    await withWorkers(8, 50, async () => {
      await limiter.acquire();
      stamps.push(Date.now());
    });

    expect(busiestWindow(stamps, WINDOW_MS)).toBeLessThanOrEqual(12);
  });

  it('줄을 선 순서대로 나간다', async () => {
    const limiter = new RateLimiter(5, WINDOW_MS);
    const order: number[] = [];

    await Promise.all(
      Array.from({ length: 12 }, async (_, i) => {
        await limiter.acquire();
        order.push(i);
      }),
    );

    // 뒤에 선 요청이 앞지르면 특정 워커가 굶는다.
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('리미터끼리는 창을 나누지 않는다', async () => {
    // 단계마다 하나씩 만들어 쓰므로, 서로 남의 창을 갉아먹으면 안 된다.
    const a = new RateLimiter(3, WINDOW_MS);
    const b = new RateLimiter(3, WINDOW_MS);
    const startedAt = Date.now();

    await Promise.all([
      ...Array.from({ length: 3 }, () => a.acquire()),
      ...Array.from({ length: 3 }, () => b.acquire()),
    ]);

    expect(Date.now() - startedAt).toBeLessThan(WINDOW_MS);
  });

  it('상한이 1보다 작으면 만들 때 거부한다', () => {
    expect(() => new RateLimiter(0)).toThrow(/at least 1/);
  });

  it('게이트웨이가 거절하는 초당 50 보다 낮게 잡혀 있다', () => {
    /*
      우리는 보낸 시각을, 게이트웨이는 도착한 시각을 센다. 지터로 몰려 도착하는 몫과
      다른 프로세스(hanscli)가 같이 쓰는 몫을 남겨야 하므로 50 을 그대로 쓰면 안 된다.
    */
    expect(KRDATA_CALLS_PER_SECOND).toBeLessThan(50);
  });
});
