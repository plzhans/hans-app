import { API_BASE_URL } from '@/shared/config/env';
import { apiFetch } from './client';

export type SocialProvider = 'google' | 'naver' | 'kakao' | 'line';

/** 로그인/토큰 응답(백엔드 TokenResponseDto). */
export interface TokenResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: string;
}

/** 내 정보(백엔드 MeResponseDto). */
export interface Me {
  id: number;
  email: string;
  emailVerified: boolean;
  name?: string | null;
  role: string;
  joinType: string;
}

export function emailLogin(email: string, password: string): Promise<TokenResponse> {
  return apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

/** 가입 인증 코드 발송(계정 생성 전). 이미 가입된 이메일이면 409, 발송 상한 초과면 429. */
export function requestSignupCode(email: string): Promise<void> {
  return apiFetch('/auth/signup/request-code', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

/** 이메일 가입 확정. 메일로 받은 코드를 함께 보내 검증된 계정을 만든다. */
export function emailSignup(
  email: string,
  password: string,
  name: string,
  code: string,
): Promise<TokenResponse> {
  return apiFetch('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password, name, code }),
  });
}

/** 소셜 콜백에서 받은 릴레이 인가코드를 토큰으로 교환한다. */
export function exchangeCode(
  code: string,
  codeVerifier: string,
): Promise<TokenResponse> {
  return apiFetch('/oauth/token', {
    method: 'POST',
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
    }),
  });
}

/**
 * 비밀번호 재설정 요청. 가입 이메일로 인증 코드를 보낸다.
 * 존재 여부와 무관하게 서버는 202 로 답한다(계정 유무 노출 방지).
 */
export function requestPasswordReset(email: string): Promise<void> {
  return apiFetch('/auth/password/reset-request', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

/** 비밀번호 재설정 확정. 메일로 받은 코드 + 새 비밀번호. 성공 시 전체 세션이 폐기된다. */
export function resetPassword(
  email: string,
  code: string,
  newPassword: string,
): Promise<void> {
  return apiFetch('/auth/password/reset', {
    method: 'POST',
    body: JSON.stringify({ email, code, newPassword }),
  });
}

/**
 * 소셜 가입 인증 코드 발송. provider 가 이메일을 검증하지 않은 경우(code_required)에 쓴다.
 * provider 가 이메일을 안 준 경우 email 을 함께 보낸다.
 */
export function socialRegisterRequestCode(
  ticket: string,
  email?: string,
): Promise<void> {
  return apiFetch('/auth/social/register/request-code', {
    method: 'POST',
    body: JSON.stringify({ ticket, email }),
  });
}

/** 소셜 신규 가입 확정(pending 티켓 + 필요 시 이메일·인증 코드). */
export function socialRegister(
  ticket: string,
  email?: string,
  code?: string,
): Promise<TokenResponse> {
  return apiFetch('/auth/social/register', {
    method: 'POST',
    body: JSON.stringify({ ticket, email, code }),
  });
}

export function getMe(): Promise<Me> {
  return apiFetch('/auth/me', {}, { auth: true });
}

export function logout(): Promise<void> {
  return apiFetch('/oauth/logout', { method: 'DELETE' }, { auth: true });
}

/**
 * SSO 인가코드 발급(로그인 상태). 외부 클라이언트의 복귀 URL(return_to)로 넘길 1회용 code 를 받는다.
 * 이메일 로그인 뒤 그 클라이언트로 코드를 실어 돌려보낼 때 쓴다.
 *
 * clientId 를 넘기면 서버가 그 클라이언트의 등록 리디렉션 URI 와 returnTo 를 대조하고,
 * 발급되는 code 에 clientId 를 박는다. 없으면 1st-party(이 포털) 복귀로 본다.
 */
export function authorize(
  redirectUri: string,
  codeChallenge: string,
  clientId?: string,
): Promise<{ code: string }> {
  return apiFetch(
    '/oauth/authorize',
    {
      method: 'POST',
      body: JSON.stringify({ redirectUri, clientId, codeChallenge }),
    },
    { auth: true },
  );
}

/**
 * 로그인 성공 후 처리. return_to(외부 클라이언트 복귀 URL)가 있으면 인가코드를 받아
 * 그 URL 로 리다이렉트하고 true 를 반환한다(SSO). 없으면 아무것도 안 하고 false.
 */
export async function relayCodeIfNeeded(
  returnTo?: string,
  clientId?: string,
  codeChallenge?: string,
  clientState?: string,
): Promise<boolean> {
  if (!returnTo) return false;
  // challenge 는 **그 앱이 만든 것**을 그대로 넘긴다. 포털이 새로 만들면 verifier 를
  // 가진 쪽(그 앱)과 짝이 안 맞아 교환이 실패한다.
  if (!codeChallenge) {
    throw new Error('code_challenge is required for SSO relay.');
  }
  const { code } = await authorize(returnTo, codeChallenge, clientId);
  const url = new URL(returnTo);
  url.searchParams.set('code', code);
  // 그 앱이 보낸 state 를 그대로 돌려준다. verifier 조회 키라 없으면 교환이 안 된다.
  if (clientState) url.searchParams.set('state', clientState);
  window.location.href = url.toString();
  return true;
}

/**
 * 소셜 로그인 시작 URL(전체 페이지 리다이렉트). 백엔드가 provider 인가 페이지로 넘긴다.
 * returnTo 로 복귀 URL을 넘기면 로그인 완료 후 백엔드가 그 URL 에 code/pending 을 실어 돌려보낸다.
 * 기본은 이 앱의 /auth/callback(자체 로그인). 외부 클라이언트 SSO 면 그 앱의 콜백을 넘긴다.
 *
 * clientId 를 함께 넘기면 백엔드가 그 클라이언트의 등록 리디렉션 URI 로 returnTo 를 검증하고
 * state 에 실어 콜백까지 운반한다. 없으면 1st-party 로 보고 AUTH_ALLOWED_ORIGINS 를 본다.
 */
export function socialLoginUrl(
  provider: SocialProvider,
  returnTo: string = `${window.location.origin}/callback`,
  clientId?: string,
  codeChallenge?: string,
  clientState?: string,
): string {
  const params = new URLSearchParams({ redirect_uri: returnTo });
  if (clientId) params.set('client_id', clientId);
  if (clientState) params.set('client_state', clientState);
  if (codeChallenge) {
    params.set('code_challenge', codeChallenge);
    params.set('code_challenge_method', 'S256');
  }
  return `${API_BASE_URL}/auth/${provider}?${params.toString()}`;
}
