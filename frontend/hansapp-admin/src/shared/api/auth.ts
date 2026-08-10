import { apiFetch } from '@/shared/api/client';

/** 로그인·갱신 응답. **refresh token 은 여기 없다** — httpOnly 쿠키로만 오간다. */
export interface TokenResponse {
  accessToken: string;
  tokenType: string;
  /** access token 만료(초). 관리자는 300(5분). */
  expiresIn: number;
  /**
   * 비밀번호를 바꿔야 하는 상태인가.
   *
   * **화면이 이 값을 보고 변경 화면으로 보내지만, 막는 것은 서버다** — 이 값이 true 인
   * 동안 서버 가드가 비밀번호 변경 외의 모든 API 를 403 으로 거절한다.
   */
  mustChangePassword: boolean;
}

export interface AdminMe {
  id: number;
  email: string;
  name: string | null;
  lastLoginAt: string | null;
  mustChangePassword: boolean;
  /** 안내 메일에 쓰는 언어(ko·en·ja·zh). 계정을 만들 때 ko 로 시작한다. */
  language: string;
  /** 화면의 시각을 펴는 IANA 타임존. 계정을 만들 때 Asia/Seoul 로 시작한다. */
  timeZone: string;
}

/** 로그인. 성공하면 서버가 refresh·힌트 쿠키를 심고 access token 을 바디로 준다. */
export const login = (email: string, password: string) =>
  apiFetch<TokenResponse>(
    '/auth/login',
    { method: 'POST', body: JSON.stringify({ email, password }) },
    // 아직 토큰이 없다. Authorization 헤더를 붙이지 않고, 401 재시도도 하지 않는다
    // (로그인 실패의 401 을 "갱신하면 되는 상황" 으로 오해하면 안 된다).
    { auth: false },
  );

export const getMe = () => apiFetch<AdminMe>('/auth/me');

/**
 * 본인의 언어·시간대 변경. 보낸 항목만 바뀐다.
 *
 * 이름·이메일은 여기 없다 — 관리자 계정은 CLI 로만 만들고 지우므로, 화면에서 식별자를
 * 갈면 CLI 쪽과 어긋난다. 국가도 없다(한국으로 굳어 있고 집계 말고는 쓰지 않는다).
 */
export const updateMyLocale = (input: {
  language?: string;
  timeZone?: string;
}) =>
  apiFetch<void>('/auth/me', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });

/**
 * 로그아웃. **실패해도 화면은 로그아웃 처리한다** —
 * 서버가 응답하지 않는다고 로그인 상태로 남겨 두는 게 더 나쁘다.
 */
export const logout = () => apiFetch<void>('/auth/logout', { method: 'DELETE' });

/**
 * 비밀번호 변경. 성공하면 **기존 세션이 전부 끊기고 새 세션이 발급된다** —
 * 응답의 access token 으로 갈아 끼우면 다시 로그인할 필요가 없다.
 */
export const changePassword = (currentPassword: string, newPassword: string) =>
  apiFetch<TokenResponse>('/auth/password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
