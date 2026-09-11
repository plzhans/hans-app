/**
 * 생성 코드가 실제 요청을 내보내는 통로.
 *
 * **SDK 는 인증을 모른다.** 토큰을 어디에 두는지, 만료되면 어떻게 회전시키는지, 기준 주소가
 * 무엇인지는 소비자마다 다르다 — 브라우저는 auth-sdk 와 Vite 환경변수를, Node 는 서비스 키와
 * 설정 파일을 쓴다. 그 차이를 여기 주입점 하나로 흡수한다.
 *
 * 이렇게 두지 않으면 SDK 안에 `import.meta.env` 같은 번들러 전용 문법이 박혀서 Node 에서
 * 쓸 수 없게 된다. 실제로 그것 때문에 클라이언트가 두 벌로 갈라져 있었다.
 *
 * 부팅 때 한 번 설정한다:
 *
 *   configureHansApi({
 *     baseUrl: 'https://develop-api.plzhans.com',
 *     fetch: (url, init) => authClient.fetchWithAuth(url, init),
 *     headers: () => ({ 'Accept-Language': i18n.language }),
 *   });
 */

/** 실제 요청을 보내는 함수. 인증·재시도는 소비자 몫이다. */
export type HansApiFetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface HansApiTransport {
  /**
   * 생성 코드가 만드는 경로 앞에 붙일 기준 주소. 끝에 슬래시를 두지 않는다.
   *
   * 비워도 된다 — fetch 쪽이 이미 기준 주소를 붙이는 경우다(브라우저의 auth SDK 가 그렇다).
   * 두 곳에서 붙이면 경로가 두 번 겹치므로 한쪽만 맡는다.
   */
  baseUrl?: string;

  fetch: HansApiFetch;

  /**
   * 매 요청에 얹을 헤더. 요청 시점에 부르므로 언어 전환처럼 도중에 바뀌는 값도 따라온다.
   * 고정값으로 캡처하면 언어를 바꾼 뒤 첫 요청이 옛 언어로 나간다.
   */
  headers?: () => Record<string, string> | Promise<Record<string, string>>;
}

/** 응답이 2xx 가 아닐 때 던진다. 본문을 담아 호출부가 서버 메시지를 읽을 수 있게 한다. */
export class HansApiError extends Error {
  constructor(
    readonly status: number,
    readonly statusText: string,
    readonly body: unknown,
  ) {
    super(`HTTP ${status} ${statusText}`);
    this.name = 'HansApiError';
  }
}

let transport: HansApiTransport | undefined;

export function configureHansApi(next: HansApiTransport): void {
  transport = next;
}

/** 설정됐는지 확인한다. 부팅 순서를 점검할 때 쓴다. */
export function isHansApiConfigured(): boolean {
  return transport !== undefined;
}

/**
 * orval 생성 코드가 부르는 mutator.
 *
 * 반환값은 응답 본문이다 — status·headers 래핑은 orval 설정에서 꺼 두었다.
 */
export const hansApiFetch = async <T>(url: string, init?: RequestInit): Promise<T> => {
  if (!transport) {
    throw new Error('hans-api SDK is not configured. Call configureHansApi() during startup.');
  }

  const headers = new Headers(init?.headers);
  for (const [key, value] of Object.entries((await transport.headers?.()) ?? {})) {
    headers.set(key, value);
  }

  const response = await transport.fetch(`${transport.baseUrl ?? ''}${url}`, { ...init, headers });

  if (!response.ok) {
    // 서버가 JSON 으로 실패 사유를 준다. 못 읽으면 텍스트로, 그것도 안 되면 비운다 —
    // 본문을 읽다 실패해서 상태 코드까지 잃는 일은 없어야 한다.
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = await response.text().catch(() => undefined);
    }
    throw new HansApiError(response.status, response.statusText, body);
  }

  /*
    **상태 코드가 아니라 본문이 비었는지로 판단한다.**

    204 만 걸러 냈더니 202 를 쓰는 라우트(가입 코드 발송·비밀번호 재설정 요청)에서 터졌다 —
    본문 없이 202 를 주는데 json() 이 "Unexpected end of JSON input" 으로 죽었다.
    성공 응답인데 화면에는 오류가 뜨는 종류라 원인을 찾기도 나쁘다.

    상태 코드 목록을 늘리는 대신 실제로 온 것을 본다. 서버가 새 라우트를 무슨 코드로 주든
    여기서 다시 깨지지 않는다.
  */
  const text = await response.text();
  if (!text) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
};
