import i18n from '@/shared/i18n';
import { authClient } from '@/shared/auth/authClient';

/**
 * orval react-query 생성 코드가 사용하는 HTTP mutator.
 *
 * 인증/언어 헤더는 여기 한 곳에서만 주입한다. 생성된 훅/함수는 인증을 모른다.
 * - 앱: X-Client-Id (공개 클라이언트 ID)
 * - 사용자: 로그인했으면 access token — **SDK 가 알아서 붙인다**(아래 주석 참고)
 * - 언어: Accept-Language 로 서버 다국어(LangText) 응답 언어 지정
 *
 * 반환값은 응답 본문(payload)이다. orval 의 fetch 래핑(status/headers)은
 * orval.config.ts 의 includeHttpResponseReturnType:false 로 꺼 두었다.
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

export const reactFetch = async <T>(url: string, options?: RequestInit): Promise<T> => {
  const headers = new Headers(options?.headers);
  headers.set('Accept-Language', i18n.language);
  if (CLIENT_ID) {
    headers.set('X-Client-Id', CLIENT_ID);
  }

  /*
    **호출을 SDK 에 맡긴다.** 로그인 상태면 access token 이 붙고, 만료가 가까우면 보내기 전에
    회전시키며, 그래도 401 이면 한 번 더 회전시켜 재시도한다 — 그 절차 전부가 SDK 안에 있다.
    익명이면 아무것도 붙지 않아 지금까지와 똑같이 클라이언트 ID 로만 나간다.

    클라이언트 ID 는 그대로 함께 보낸다. 그건 "어느 앱이 부르는가" 이고 토큰은 "누가 부르는가"
    라, 둘 다 사실이기 때문이다.

    base URL 도 SDK 가 붙인다(apiBaseUrl). 두 곳에서 같은 환경변수를 읽던 것을 한 곳으로 모았다.
  */
  const res = await authClient.fetchWithAuth(url, { ...options, headers });

  if (!res.ok) {
    // react-query 의 isError 로 흐르도록 던진다. 서버 에러 본문을 최대한 담는다.
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = await res.text().catch(() => undefined);
    }
    throw Object.assign(new Error(`HTTP ${res.status} ${res.statusText}`), {
      status: res.status,
      body,
    });
  }

  /*
    **상태 코드가 아니라 본문이 비었는지로 판단한다.**

    204 만 걸러 냈더니 202 를 쓰는 라우트(가입 코드 발송·비밀번호 재설정 요청·소셜 코드
    발송)에서 터졌다 — 본문 없이 202 를 주는데 res.json() 이 "Unexpected end of JSON input"
    으로 죽었다. 성공 응답인데 화면에는 오류가 뜨는 종류라 원인을 찾기도 나쁘다.

    상태 코드 목록을 늘리는 대신 실제로 온 것을 본다. 서버가 새 라우트를 무슨 코드로 주든
    여기서 다시 깨지지 않는다.
  */
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
};
