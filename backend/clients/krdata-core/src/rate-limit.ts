/**
 * 초당 호출 제한.
 *
 * 게이트웨이가 초당 50콜에서 거절한다(코드 23 / HTTP 429). 응답 헤더가 그 값을 직접
 * 말해 준다 — `x-ratelimit-limit=50 x-ratelimit-remaining=0`.
 *
 * **재시도로는 못 막는다.** 코드 23 은 판정이 retry 라 다시 부르기는 하지만, 그때도
 * 동시에 도는 다른 워커들이 같이 몰려 있어 다음 창에서 또 걸린다. 실제로 운영의
 * nmc.3 이 그렇게 죽었다 — 워커 8개가 병원 하나당 상세를 연달아 부르면서 초당 50을
 * 넘겼고, 세 번을 다시 불러도 전부 429 였다.
 *
 * 그래서 나가기 전에 센다. 제한을 넘길 요청은 창이 열릴 때까지 기다린다.
 */

/**
 * 우리가 스스로 지키는 초당 상한. **게이트웨이의 50 보다 낮게 둔다.**
 *
 * 우리 시계로 센 1초와 게이트웨이가 세는 1초는 경계가 어긋나 있다. 딱 50 으로 두면
 * 우리 창의 뒤쪽 25개와 다음 창의 앞쪽 25개가 저쪽에서는 한 창에 담길 수 있다 —
 * 지키고 있는데도 걸린다. 그 어긋남을 흡수할 만큼만 낮춘다.
 */
export const MAX_CALLS_PER_SECOND = 40;

/** 한 창의 길이. 게이트웨이가 "초당" 이라고 했으므로 1초다. */
const WINDOW_MS = 1_000;

/**
 * 최근 한 창에 나간 호출 시각. 오래된 것부터 빠지므로 앞이 가장 이르다.
 *
 * **모듈 수준에 둔다 = 프로세스 전역이다.** 제한은 서비스키에 걸리는 것이라
 * 클라이언트(hira·nmc·mois)마다 따로 세면 합쳐서 넘긴다. 어차피 단계는 하나씩
 * 순서대로 도므로 전역으로 둬도 서로 굶기지 않는다.
 */
const sent: number[] = [];

/**
 * 자리 하나를 잡는 동안 다른 요청이 끼어들지 못하게 하는 줄.
 *
 * **판정과 기록 사이에 await 가 있어서 필요하다.** 기다렸다 깨어난 요청이 자기 자리를
 * 적기 전에 다른 요청이 같은 빈자리를 보면, 둘 다 통과해 상한을 넘는다
 * (mapWithConcurrency 의 `calls += await` 가 어긋났던 것과 같은 모양이다).
 */
let queue: Promise<void> = Promise.resolve();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 창 밖으로 나간 기록을 버린다. */
function evict(now: number): void {
  while (sent.length > 0 && now - sent[0] >= WINDOW_MS) {
    sent.shift();
  }
}

/**
 * 나갈 자리가 생길 때까지 기다린다. 돌아오면 이 호출은 이번 창의 한 자리를 차지한 상태다.
 *
 * 호출 직전에 부른다 — 재시도도 한 번의 호출이라 같이 센다.
 */
export function acquireCallSlot(): Promise<void> {
  const turn = queue.then(async () => {
    for (;;) {
      const now = Date.now();
      evict(now);

      if (sent.length < MAX_CALLS_PER_SECOND) {
        sent.push(now);
        return;
      }

      // 가장 이른 기록이 창을 벗어나면 자리가 하나 난다. 딱 그만큼만 잔다.
      await sleep(WINDOW_MS - (now - sent[0]));
    }
  });

  // 줄은 끊기면 안 된다. 앞 사람이 실패해도 뒷사람 차례는 와야 한다.
  queue = turn.catch(() => undefined);
  return turn;
}

/** 테스트용. 창을 비운다. */
export function resetCallSlots(): void {
  sent.length = 0;
  queue = Promise.resolve();
}
