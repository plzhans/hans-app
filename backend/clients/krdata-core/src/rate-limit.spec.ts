import { acquireCallSlot, MAX_CALLS_PER_SECOND, resetCallSlots } from './rate-limit';

beforeEach(() => {
  resetCallSlots();
});

describe('acquireCallSlot', () => {
  it('상한까지는 기다리지 않는다', async () => {
    const started = Date.now();

    await Promise.all(Array.from({ length: MAX_CALLS_PER_SECOND }, () => acquireCallSlot()));

    // 창이 비어 있으면 상한만큼은 바로 나가야 한다. 여기서 조는 순간 처리량이 반토막 난다.
    expect(Date.now() - started).toBeLessThan(200);
  });

  it('상한을 넘는 호출은 창이 열릴 때까지 기다린다', async () => {
    const started = Date.now();

    await Promise.all(Array.from({ length: MAX_CALLS_PER_SECOND + 1 }, () => acquireCallSlot()));

    /*
      마지막 하나는 첫 호출이 창을 벗어날 때까지 잔다. 타이머가 조금 일찍 깨는 환경이
      있어 여유를 두고 본다 — 중요한 것은 "기다렸다" 이지 정확히 1초인지가 아니다.
    */
    expect(Date.now() - started).toBeGreaterThanOrEqual(900);
  });

  it('창이 지나면 다시 상한만큼 나간다', async () => {
    await Promise.all(Array.from({ length: MAX_CALLS_PER_SECOND }, () => acquireCallSlot()));

    await new Promise((resolve) => setTimeout(resolve, 1_050));

    const started = Date.now();
    await acquireCallSlot();

    expect(Date.now() - started).toBeLessThan(200);
  });

  it('게이트웨이가 거절하는 초당 50 보다 낮게 잡혀 있다', () => {
    /*
      우리는 보낸 시각을, 게이트웨이는 도착한 시각을 센다. 지터로 몰려 도착하는 몫과
      다른 프로세스(hanscli)가 같이 쓰는 몫을 남겨야 하므로 50 을 그대로 쓰면 안 된다.
    */
    expect(MAX_CALLS_PER_SECOND).toBeLessThan(50);
  });
});

describe('부하를 걸었을 때', () => {
  /** 슬라이딩 1초 창 어디를 잘라도 이 값을 넘으면 안 된다. */
  function busiestSecond(stamps: number[]): number {
    const sorted = [...stamps].sort((a, b) => a - b);
    let worst = 0;
    for (let i = 0; i < sorted.length; i++) {
      let n = 0;
      while (i + n < sorted.length && sorted[i + n] - sorted[i] < 1_000) {
        n += 1;
      }
      worst = Math.max(worst, n);
    }
    return worst;
  }

  it('한꺼번에 몰려도 어떤 1초 창에서든 상한을 안 넘는다', async () => {
    const stamps: number[] = [];

    await Promise.all(
      Array.from({ length: MAX_CALLS_PER_SECOND * 3 }, async () => {
        await acquireCallSlot();
        stamps.push(Date.now());
      }),
    );

    expect(busiestSecond(stamps)).toBeLessThanOrEqual(MAX_CALLS_PER_SECOND);
  });

  it('줄을 선 순서대로 나간다', async () => {
    const order: number[] = [];

    await Promise.all(
      Array.from({ length: MAX_CALLS_PER_SECOND + 5 }, async (_, i) => {
        await acquireCallSlot();
        order.push(i);
      }),
    );

    // 뒤에 선 요청이 앞을 앞지르면 특정 워커가 굶는다.
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});
