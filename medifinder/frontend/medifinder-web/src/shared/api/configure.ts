import i18n from '@/shared/i18n';
import { authClient } from '@/shared/auth/authClient';
import { configureHansApi } from '@hansapp/api-sdk/react';

/**
 * hans-api SDK 에 이 앱의 요청 방식을 알려준다. **부팅 때 한 번** 부른다.
 *
 * SDK 는 인증도 언어도 모른다 — 브라우저와 Node 가 서로 다른 방식을 쓰기 때문에 일부러
 * 비워 둔 자리다. 여기서 채운다.
 */

/**
 * 공개 클라이언트 ID. 브라우저 요청의 인증 수단이다.
 *
 * 번들에 그대로 박히지만 비밀이 아니다 — 서버가 이 ID 에 등록된 오리진과 요청 Origin 을
 * 대조하므로, 값만 훔쳐도 등록되지 않은 사이트에서는 쓸 수 없다.
 *
 * **서비스 키(sk_...)는 여기 두지 않는다.** 그건 오리진을 보지 않는 비밀값이라
 * 번들에 들어가는 순간 그대로 유출된다 — 서버-서버 호출에서만 쓴다.
 */
const CLIENT_ID = import.meta.env.VITE_HANSAPP_CLIENT_ID as string | undefined;

export function configureApi(): void {
  configureHansApi({
    /*
      기준 주소를 여기서 안 붙인다. authClient 가 이미 붙인다(apiBaseUrl) — 두 곳에서
      붙이면 경로가 겹친다.
    */
    fetch: (url, init) => authClient.fetchWithAuth(url, init),

    /*
      요청 시점에 부른다. 언어를 바꾼 직후 첫 요청이 옛 언어로 나가는 것을 막는다.

      클라이언트 ID 는 토큰과 함께 보낸다. 그건 "어느 앱이 부르는가" 이고 토큰은 "누가
      부르는가" 라, 둘 다 사실이기 때문이다. 토큰은 authClient 가 알아서 붙인다 —
      만료가 가까우면 보내기 전에 회전시키고, 그래도 401 이면 한 번 더 회전시켜 재시도한다.
    */
    headers: () => ({
      'Accept-Language': i18n.language,
      ...(CLIENT_ID ? { 'X-Client-Id': CLIENT_ID } : {}),
    }),
  });
}
