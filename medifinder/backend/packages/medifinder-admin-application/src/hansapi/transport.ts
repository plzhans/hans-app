/**
 * 공유 SDK(@hansapp/api-sdk)에 이 CLI 의 요청 방식을 알려준다. **부팅 때 한 번** 부른다.
 *
 * SDK 는 인증도 속도 조절도 모른다 — 브라우저와 서버가 서로 다른 방식을 쓰기 때문에
 * 일부러 비워 둔 자리다. 브라우저(medifinder-web)는 auth SDK 와 오리진 대조를 채우고,
 * 여기는 서비스 키와 호출 간격을 채운다.
 */
import { configureHansApi } from '@hansapp/api-sdk';

import type { HansApiConfig } from '../config';

/**
 * 호출 간 최소 간격.
 *
 * 서버는 IP 당 60초에 300회로 막는다(hansapp-api app.module.ts). 사이트맵 한 번에
 * 900회 넘게 부르므로 그냥 돌리면 중간에 429 로 끊긴다. 한도의 8할 정도로 흘려보낸다 —
 * 사이트맵은 급할 이유가 없고, 남은 여유는 같은 IP 를 쓰는 다른 호출 몫이다.
 */
const MIN_INTERVAL_MS = 250;

/** 429·5xx 재시도 횟수. 이걸 넘으면 실행을 실패시킨다. */
const MAX_RETRIES = 5;

export function configureTransport(config: HansApiConfig): void {
  let nextAllowedAt = 0;

  /** 앞 호출과 MIN_INTERVAL_MS 이상 벌린다. */
  const pace = async (): Promise<void> => {
    const now = Date.now();
    const waitMs = nextAllowedAt - now;
    nextAllowedAt = Math.max(now, nextAllowedAt) + MIN_INTERVAL_MS;
    if (waitMs > 0) await sleep(waitMs);
  };

  configureHansApi({
    baseUrl: config.baseUrl,

    /*
      언어 헤더를 보내지 않는다. 사이트맵에 들어가는 것은 병원 id 뿐이고 번역된 값을
      쓰지 않는다 — 언어별 URL 은 우리가 접두사로 만든다.

      X-Client-Id 도 쓰지 않는다. 그쪽이 WEB 타입이면 요청 Origin 을 등록 오리진과
      대조하는데, CLI 는 브라우저가 아니라 Origin 이 없다.
    */
    headers: () => ({ Authorization: `Bearer ${config.serviceKey}` }),

    /*
      **재시도를 여기서 한다.** SDK 의 mutator 는 2xx 가 아니면 바로 던지므로, 물러섰다
      다시 거는 일은 그보다 아래인 이 fetch 안에서 끝나야 한다. 밖에서 하면 호출부마다
      같은 코드를 되풀이하게 된다.
    */
    fetch: async (url, init) => {
      for (let attempt = 0; ; attempt += 1) {
        await pace();
        const response = await fetch(url, init);

        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable || attempt >= MAX_RETRIES) {
          return response;
        }

        // 서버가 얼마나 기다리라고 했으면 그 값을 따른다. 없으면 배로 늘려 가며 물러선다.
        const retryAfter = Number(response.headers.get('retry-after'));
        const waitMs =
          Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 1000;
        console.warn(
          `[hans-api] HTTP ${response.status} — ${waitMs}ms 뒤 재시도 (${attempt + 1}/${MAX_RETRIES})`,
        );
        await sleep(waitMs);
      }
    },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
