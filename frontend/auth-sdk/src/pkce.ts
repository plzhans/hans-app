import { Preferences } from '@capacitor/preferences';

/**
 * PKCE(RFC 7636) 파라미터 생성·보관.
 *
 * verifier 는 **절대 전송되지 않는다.** 인가 요청에는 그 해시(challenge)만 나가고,
 * 원본은 마지막 토큰 교환 때 POST 바디로 딱 한 번 나간다. 그래서 리다이렉트 왕복 전체를
 * 도청해도 코드를 교환할 수 없다 — 이게 public client 가 client_secret 없이 안전한 이유다.
 *
 * **저장에 Preferences 를 쓰는 이유:** 웹에서는 localStorage, 네이티브에서는
 * UserDefaults/SharedPreferences 로 내려간다. 네이티브 OAuth 는 앱 밖(ASWebAuthenticationSession /
 * Custom Tabs)에서 진행되고 그동안 OS 가 앱을 종료할 수 있어, sessionStorage 처럼 휘발성이면
 * 돌아왔을 때 verifier 가 사라진다.
 *
 * **그런데 웹의 localStorage 는 탭 간 공유라, 두 탭이 동시에 로그인하면 서로 덮어쓴다.**
 * 그래서 키를 state 로 분리한다 — 흐름마다 state 가 다르니 탭끼리 충돌하지 않고,
 * 콜백 URL 이 state 를 그대로 돌려주므로 어느 verifier 를 꺼낼지도 알 수 있다.
 */

/** 저장 키 접두사. state 를 붙여 흐름마다 분리한다. */
const PREFIX = 'hansapp.pkce.';

/** 보관 유효기간. 인가코드 수명(30초)보다 넉넉하되, 버려진 항목이 오래 남지 않게. */
const TTL_MS = 10 * 60 * 1000;

export interface PkceRequest {
  /** 인가 요청에 실어 보낼 값들 */
  state: string;
  codeChallenge: string;
}

interface Stored {
  verifier: string;
  expiresAt: number;
}

/** base64url 인코딩(패딩 없음). btoa 는 latin1 만 받으므로 바이트 단위로 넘긴다. */
function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomBase64url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

async function sha256base64url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return base64url(new Uint8Array(digest));
}

/**
 * verifier·state 를 만들어 보관하고, 인가 요청에 실을 값만 돌려준다.
 * verifier 는 여기서 밖으로 나가지 않는다.
 */
export async function createPkceRequest(): Promise<PkceRequest> {
  await sweepExpired();

  // 32 bytes → base64url 43자. RFC 7636 이 요구하는 43~128자 범위의 최소값이다.
  const verifier = randomBase64url(32);
  const state = randomBase64url(16);
  const codeChallenge = await sha256base64url(verifier);

  const stored: Stored = { verifier, expiresAt: Date.now() + TTL_MS };
  await Preferences.set({ key: PREFIX + state, value: JSON.stringify(stored) });

  return { state, codeChallenge };
}

/**
 * 콜백에서 state 로 verifier 를 꺼낸다. **꺼내면 지운다**(1회용).
 * 없으면 null — 이 브라우저가 시작하지 않은 흐름이라는 뜻이라, 교환하면 안 된다.
 */
export async function takeVerifier(state: string | null): Promise<string | null> {
  if (!state) return null;
  const key = PREFIX + state;
  const { value } = await Preferences.get({ key });
  await Preferences.remove({ key });
  if (!value) return null;
  try {
    const stored = JSON.parse(value) as Stored;
    return stored.expiresAt > Date.now() ? stored.verifier : null;
  } catch {
    return null;
  }
}

/**
 * 만료된 항목을 지운다. 사용자가 로그인을 중단하면 항목이 그대로 남으므로,
 * 새 흐름을 시작할 때마다 한 번씩 쓸어낸다.
 */
async function sweepExpired(): Promise<void> {
  const { keys } = await Preferences.keys();
  const now = Date.now();
  await Promise.all(
    keys
      .filter((k) => k.startsWith(PREFIX))
      .map(async (key) => {
        const { value } = await Preferences.get({ key });
        if (!value) return;
        try {
          const stored = JSON.parse(value) as Stored;
          if (stored.expiresAt <= now) await Preferences.remove({ key });
        } catch {
          await Preferences.remove({ key });
        }
      }),
  );
}
