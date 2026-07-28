import i18n from '@/shared/i18n';

/**
 * orval react-query 생성 코드가 사용하는 HTTP mutator.
 *
 * 인증/언어 헤더는 여기 한 곳에서만 주입한다. 생성된 훅/함수는 인증을 모른다.
 * - 인증: X-Client-Id (공개 클라이언트 ID)
 * - 언어: Accept-Language 로 서버 다국어(LangText) 응답 언어 지정
 *
 * 반환값은 응답 본문(payload)이다. orval 의 fetch 래핑(status/headers)은
 * orval.config.ts 의 includeHttpResponseReturnType:false 로 꺼 두었다.
 */
const BASE_URL = import.meta.env.VITE_HANSAPP_BASE_URL ?? '';

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

  const res = await fetch(`${BASE_URL}${url}`, { ...options, headers });

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

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
};
