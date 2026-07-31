/**
 * PKCE(RFC 7636) 파라미터 생성·보관.
 *
 * 이 인증웹은 두 가지 역할을 하고, PKCE 에서 서로 다르게 동작한다.
 *
 *   **중계자**  외부 앱(medifinder 등)이 SSO 로 들어온 경우.
 *              URL 의 code_challenge 를 그대로 넘겨주기만 한다. verifier 는 그 앱이 갖고 있고
 *              인증웹은 볼 일이 없다 — 봐서도 안 된다.
 *
 *   **당사자**  인증웹 자신의 로그인(소셜). 이때는 인증웹이 verifier 를 만들어 보관하고,
 *              자기 콜백에서 직접 교환한다.
 *
 * verifier 는 전체 페이지 이동(소셜 왕복)을 건너야 하므로 메모리에 둘 수 없다.
 * sessionStorage 를 쓰는 이유는 **탭마다 격리**되기 때문이다 — localStorage 면 두 탭이
 * 동시에 로그인할 때 서로 덮어써서 교환이 깨진다.
 */

const KEY = 'hansapp.pkce.verifier';

export interface PkceRequest {
  codeChallenge: string;
}

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256base64url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return base64url(new Uint8Array(digest));
}

/**
 * 인증웹 자신의 로그인용 verifier 를 만들어 보관하고 challenge 만 돌려준다.
 * 32 bytes → base64url 43자로, RFC 7636 이 요구하는 43~128자 범위를 만족한다.
 */
export async function createPkceRequest(): Promise<PkceRequest> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const verifier = base64url(bytes);
  sessionStorage.setItem(KEY, verifier);
  return { codeChallenge: await sha256base64url(verifier) };
}

/** 보관해둔 verifier 를 꺼내고 지운다(1회용). 없으면 null. */
export function takeVerifier(): string | null {
  const verifier = sessionStorage.getItem(KEY);
  sessionStorage.removeItem(KEY);
  return verifier;
}
