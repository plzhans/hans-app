import { AUTH_WEB_URL, CLIENT_ID } from '@/shared/config/env';
import { createPkceRequest } from './pkce';

/** OAuth state 보관 키(CSRF 대조용). 콜백에서 돌아온 state 와 대조한다. */
const STATE_KEY = 'hansapp.oauth.state';

/**
 * 로그인 포털(hansapp-auth)로 리다이렉트한다.
 *
 * 콘솔은 자기 로그인 UI 를 갖지 않고, medifinder 와 동일하게 **표준 OAuth2 code+PKCE(S256)** 로
 * 포털의 authorization_endpoint(/auth/login)에 붙는다. 포털에서 로그인이 끝나면 code 를 실어
 * 콘솔의 /auth/callback 으로 돌려보낸다.
 */
export async function startLogin(): Promise<void> {
  const state = crypto.randomUUID();
  sessionStorage.setItem(STATE_KEY, state);
  // verifier 는 createPkceRequest 가 sessionStorage 에 보관한다(콜백의 takeVerifier 로 꺼낸다).
  const { codeChallenge } = await createPkceRequest();
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: `${window.location.origin}/auth/callback`,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
  });
  window.location.href = `${AUTH_WEB_URL}/login?${params.toString()}`;
}

/** 콜백에서 돌아온 state 를 보관값과 대조하고 지운다(1회용). */
export function consumeState(returned: string | null): boolean {
  const expected = sessionStorage.getItem(STATE_KEY);
  sessionStorage.removeItem(STATE_KEY);
  return Boolean(returned) && returned === expected;
}
