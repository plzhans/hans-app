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
      우리 시계의 1초와 게이트웨이의 1초는 경계가 어긋난다. 딱 50 으로 두면 지키고
      있는데도 걸리므로, 이 값이 50 이 되는 변경은 막는다.
    */
    expect(MAX_CALLS_PER_SECOND).toBeLessThan(50);
  });
});
