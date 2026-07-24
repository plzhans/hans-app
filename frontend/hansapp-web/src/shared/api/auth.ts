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

export function emailSignup(
  email: string,
  password: string,
  name?: string,
): Promise<TokenResponse> {
  return apiFetch('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password, name }),
  });
}

/** 소셜 콜백에서 받은 릴레이 인가코드를 토큰으로 교환한다. */
export function exchangeCode(code: string): Promise<TokenResponse> {
  return apiFetch('/oauth/token', {
    method: 'POST',
    body: JSON.stringify({ grant_type: 'authorization_code', code }),
  });
}

/** 소셜 신규 가입 확정(pending 티켓 + 필요 시 이메일). */
export function socialRegister(
  ticket: string,
  email?: string,
): Promise<TokenResponse> {
  return apiFetch('/auth/social/register', {
    method: 'POST',
    body: JSON.stringify({ ticket, email }),
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
  returnTo: string,
  clientId?: string,
): Promise<{ code: string }> {
  return apiFetch(
    '/oauth/authorize',
    { method: 'POST', body: JSON.stringify({ returnTo, clientId }) },
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
): Promise<boolean> {
  if (!returnTo) return false;
  const { code } = await authorize(returnTo, clientId);
  const url = new URL(returnTo);
  url.searchParams.set('code', code);
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
  returnTo: string = `${window.location.origin}/auth/callback`,
  clientId?: string,
): string {
  const params = new URLSearchParams({ return_to: returnTo });
  if (clientId) params.set('client_id', clientId);
  return `${API_BASE_URL}/auth/${provider}?${params.toString()}`;
}
