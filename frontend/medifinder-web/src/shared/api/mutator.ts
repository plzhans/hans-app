import i18n from '@/shared/i18n';

/**
 * orval react-query 생성 코드가 사용하는 HTTP mutator.
 *
 * 인증/언어 헤더는 여기 한 곳에서만 주입한다. 생성된 훅/함수는 인증을 모른다.
 * - 인증: Authorization: Bearer <VITE_HANSAPI_KEY> (JWT / API Key 공통)
 * - 언어: Accept-Language 로 서버 다국어(LangText) 응답 언어 지정
 *
 * 반환값은 응답 본문(payload)이다. orval 의 fetch 래핑(status/headers)은
 * orval.config.ts 의 includeHttpResponseReturnType:false 로 꺼 두었다.
 */
const BASE_URL = import.meta.env.VITE_HANSAPI_BASE_URL ?? '';
const API_KEY = import.meta.env.VITE_HANSAPI_KEY as string | undefined;

export const reactFetch = async <T>(url: string, options?: RequestInit): Promise<T> => {
  const headers = new Headers(options?.headers);
  headers.set('Accept-Language', i18n.language);
  if (API_KEY) {
    headers.set('Authorization', `Bearer ${API_KEY}`);
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
