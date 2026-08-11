import { apiFetch } from '@/shared/api/client';
import type { AdminRole } from '@/shared/api/admins';

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
  /**
   * 내 등급. **관리자 화면이 이 값으로 버튼을 가린다** — 자기보다 높은 등급의 계정은
   * 만들지도 고치지도 못한다. 막는 것은 서버이고, 이 값은 못 하는 일을 안 보여 주기 위한 것이다.
   */
  role: AdminRole;
  /** 안내 메일에 쓰는 언어(ko·en·ja·zh). 계정을 만들 때 ko 로 시작한다. */
  language: string;
  /** 화면의 시각을 펴는 IANA 타임존. 계정을 만들 때 Asia/Seoul 로 시작한다. */
  timeZone: string;
}

/**
 * 비밀번호 찾기 — 재설정 링크를 메일로 보내 달라고 한다.
 *
 * **계정이 있든 없든 성공한다.** 이 주소가 관리자인지를 알려 주면 표적을 좁혀 주기 때문에
 * 서버가 일부러 가리는 것이다 — 화면도 "보냈다" 로만 답해야 한다.
 */
export const forgotPassword = (email: string) =>
  apiFetch<void>(
    '/auth/password/forgot',
    { method: 'POST', body: JSON.stringify({ email }) },
    { auth: false },
  );

/** 재설정 링크가 누구의 것인지. 화면이 열릴 때 부른다. */
export interface PasswordResetTarget {
  /**
   * 가린 이메일(`plz***@gmail.com`).
   *
   * **원문은 오지 않는다.** 링크를 쥔 사람은 이미 그 메일함 주인이라 새로 알 것이 없고,
   * 화면 공유·스크린샷으로 새는 자리만 줄인다.
   */
  maskedEmail: string;
  /** 링크 만료 시각(ISO 8601). */
  expiresAt: string;
}

/**
 * 이 링크가 누구의 것인지 묻는다. **링크가 죽었으면 400 이다.**
 *
 * 이메일을 토큰 안에 담아 브라우저가 풀어 보게 하지 않는 이유는 화면이 그 값을 검증할 수
 * 없기 때문이다 — 아무나 남의 주소를 넣어 링크를 만들면 우리 도메인에서 그대로 보인다.
 */
export const getPasswordResetTarget = (token: string) =>
  apiFetch<PasswordResetTarget>(
    `/auth/password/reset?token=${encodeURIComponent(token)}`,
    {},
    { auth: false },
  );

/**
 * 메일로 받은 링크의 토큰으로 비밀번호를 다시 세운다.
 *
 * **여기는 실패 사유가 그대로 온다**(만료·이미 씀). 토큰을 손에 쥔 사람에게 그것마저
 * 숨기면 왜 안 되는지 알 길이 없다.
 */
export const resetPasswordWithToken = (token: string, newPassword: string) =>
  apiFetch<void>(
    '/auth/password/reset',
    { method: 'POST', body: JSON.stringify({ token, newPassword }) },
    { auth: false },
  );

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
