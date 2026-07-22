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
 * 소셜 로그인 시작 URL(전체 페이지 리다이렉트). 백엔드가 provider 인가 페이지로 넘긴다.
 * return_to 로 복귀 URL(이 앱의 /callback)을 함께 넘기면, 로그인 완료 후 백엔드가
 * 그 URL 에 code/pending 을 실어 돌려보낸다(백엔드 AUTH_ALLOWED_ORIGINS 에 이 오리진이 있어야 함).
 */
export function socialLoginUrl(provider: SocialProvider): string {
  const returnTo = `${window.location.origin}/callback`;
  return `${API_BASE_URL}/auth/${provider}?return_to=${encodeURIComponent(returnTo)}`;
}
