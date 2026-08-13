import { API_BASE_URL } from '@/shared/config/env';
import { apiFetch } from '@/shared/api/client';

/** 붙어 있는 소셜 연동 하나. */
export interface SocialLink {
  provider: string;
  /** 연동한 소셜 계정의 이메일. 표시용이다 — 로그인 대조는 provider 식별자로 한다. */
  email: string | null;
  linkedAt: string;
}

/** 쓸 수 있는 소셜. 설정(admin.google.*)이 비어 있으면 false 다. */
export interface SocialProviders {
  google: boolean;
}

/**
 * 로그인 화면이 구글 버튼을 그릴지 묻는다. **로그인 전에 부르므로 인증을 붙이지 않는다.**
 */
export const getSocialProviders = () =>
  apiFetch<SocialProviders>('/auth/social/providers', {}, { auth: false });

export const getMySocialLinks = () => apiFetch<SocialLink[]>('/auth/me/social');

/**
 * 구글 로그인 시작 주소.
 *
 * **fetch 가 아니라 브라우저 이동으로 간다.** 구글 인가 화면은 우리 화면이 아니라서
 * XHR 로는 갈 수 없고, 돌아오는 콜백도 서버가 쿠키를 심어야 한다.
 *
 * @param returnTo 로그인 뒤 돌아올 콘솔 안의 경로.
 */
export function googleLoginUrl(returnTo?: string): string {
  const query = returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : '';
  return `${API_BASE_URL}/auth/social/google${query}`;
}

/**
 * 연동 시작 주소를 받아 온다. 주소에 3분짜리 티켓이 박혀 있어 **받은 즉시 이동해야 한다.**
 */
export const startGoogleLink = () =>
  apiFetch<{ startUrl: string }>('/auth/me/social/google/link', {
    method: 'POST',
  });

/** 구글 연동 해제. 붙어 있지 않아도 성공이다. */
export const unlinkGoogle = () =>
  apiFetch<void>('/auth/me/social/google', { method: 'DELETE' });

/**
 * 콜백이 실패를 실어 보낼 때 쓰는 코드 → 화면 문구.
 *
 * **사유를 가리지 않는 이유가 로그인 실패와 다르다.** 여기까지 온 사람은 구글 인증을 이미
 * 통과했으므로, "관리자 계정이 없다" 를 알려 줘도 새로 새는 정보가 없다 — 반대로 가리면
 * 무엇을 고쳐야 할지 알 수 없다.
 */
export const SOCIAL_ERROR_MESSAGE: Record<string, string> = {
  not_registered: '이 구글 계정의 이메일로 등록된 관리자가 없습니다.',
  email_unverified: '구글에서 이메일 인증이 되지 않은 계정입니다.',
  disabled: '사용할 수 없는 관리자 계정입니다.',
  link_conflict: '이미 다른 관리자 계정에 연동된 구글 계정입니다.',
  already_linked: '이미 구글이 연동돼 있습니다. 해제한 뒤 다시 연동하세요.',
  failed: '구글 로그인에 실패했습니다. 다시 시도해 주세요.',
};

/** 모르는 코드가 와도 화면이 비지 않게 한다. */
export function socialErrorMessage(code: string | null): string | null {
  if (!code) return null;
  return SOCIAL_ERROR_MESSAGE[code] ?? SOCIAL_ERROR_MESSAGE.failed;
}
