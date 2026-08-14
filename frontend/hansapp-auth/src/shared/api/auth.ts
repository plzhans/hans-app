import { API_BASE_URL } from '@/shared/config/env';
import { detectClientLocale } from '@/shared/lib/clientLocale';
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
  /** 회원 등급(BASIC·PRO·UNLIMITED). 앱 생성 한도를 정한다. */
  tier: string;
  joinType: string;
  createdAt: string;
  /** 비밀번호가 설정돼 있는가. 소셜로만 가입했으면 false — 비밀번호 변경을 띄우지 않는다. */
  hasPassword: boolean;
  /** 연동된 소셜 제공자(GOOGLE·NAVER·KAKAO·LINE). 이메일만으로 가입했으면 빈 배열. */
  linkedProviders: string[];
  /** 고른 언어(ko·en·ja·zh). 고른 적이 없으면 null — 그때는 요청 헤더를 따른다. */
  language?: string | null;
  /** 고른 IANA 타임존. 고른 적이 없으면 null. */
  timeZone?: string | null;
}

/**
 * 동의 기록 한 줄. **본인 열람용**(개인정보처리방침 제10조).
 * IP·기기는 서버가 돌려주지 않는다 — 본인 것이라도 화면에 뿌릴 이유가 없다.
 */
export interface ConsentRecord {
  type: string;
  version: string;
  agreedAt: string;
}

/**
 * 이메일 로그인.
 *
 * `rememberMe` 는 **쿠키의 수명**을 정한다 — 켜면 브라우저를 닫아도 남고, 끄면 닫을 때
 * 사라진다. 탭 사이 공유는 어느 쪽이든 되므로(쿠키는 탭을 가리지 않는다) 이 값과 무관하다.
 */
export function emailLogin(
  email: string,
  password: string,
  rememberMe: boolean,
): Promise<TokenResponse> {
  return apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, rememberMe }),
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
/**
 * 가입 동의. **서버가 없으면 거절한다** — 화면에서만 막으면 API 를 직접 부르는 경로가 남는다.
 *
 * 판(version)은 화면이 실제로 보여준 문서의 것이다. 서버가 자기 현재 판과 대조해 다르면
 * 거절하므로, 옛 번들을 든 브라우저가 옛 조문을 보여주고 새 판에 동의한 것으로 기록되는 일이
 * 없다. 값은 @hansapp/legal 문서의 `version` 에서 온다.
 */
export interface ConsentPayload {
  termsVersion: string;
  privacyVersion: string;
}

export function emailSignup(
  email: string,
  password: string,
  name: string,
  code: string,
  consent: ConsentPayload,
): Promise<TokenResponse> {
  return apiFetch('/auth/signup', {
    method: 'POST',
    // 언어·타임존은 **가입할 때만** 브라우저에서 뽑아 보낸다. 이후로는 본인이 고른 값이
    // 정본이라, 로그인할 때마다 덮어쓰면 기기를 옮길 때 설정이 조용히 되돌아간다.
    body: JSON.stringify({
      email,
      password,
      name,
      code,
      consent,
      clientLocale: detectClientLocale(),
    }),
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

/** 소셜 신규 가입 확정(pending 티켓 + 사용자가 고른 이메일·이름 + 필요 시 인증 코드). */
export function socialRegister(
  ticket: string,
  consent: ConsentPayload,
  email?: string,
  code?: string,
  name?: string,
): Promise<TokenResponse> {
  return apiFetch('/auth/social/register', {
    method: 'POST',
    body: JSON.stringify({
      ticket,
      email,
      name,
      code,
      consent,
      clientLocale: detectClientLocale(),
    }),
  });
}

export function getMe(): Promise<Me> {
  return apiFetch('/users/me', {}, { auth: true });
}

/**
 * 내 정보 변경. **보낸 항목만 바뀐다** — 이름만 고치려고 언어까지 실을 필요가 없다.
 * 이름에 빈 문자열을 보내면 이름을 지운다.
 *
 * 국가는 여기 없다. 가입 때 한 번 기록하는 집계용 값이라 고칠 경로가 없다.
 */
export function updateMyProfile(input: {
  name?: string;
  language?: string;
  timeZone?: string;
}): Promise<void> {
  return apiFetch(
    '/users/me',
    { method: 'PATCH', body: JSON.stringify(input) },
    { auth: true },
  );
}

/**
 * 비밀번호 변경·설정. **엔드포인트가 하나다.**
 *
 * 소셜로만 가입해 비밀번호가 없는 계정은 `currentPassword` 를 비우고 부른다 — 물을 것이
 * 없고, 로그인 상태가 곧 신원 증명이다. **어느 쪽인지는 서버가 정한다**: 계정에 비밀번호가
 * 있으면 이 값이 반드시 있어야 하고 없거나 틀리면 401 이다. 화면은 `me.hasPassword` 로
 * 무엇을 물을지만 고르면 된다.
 */
export function updatePassword(input: {
  currentPassword?: string;
  newPassword: string;
}): Promise<void> {
  return apiFetch(
    '/users/me/password',
    { method: 'PUT', body: JSON.stringify(input) },
    { auth: true },
  );
}

/**
 * 회원 탈퇴. 계정이 탈퇴 상태로 바뀌고 모든 세션이 폐기된다.
 *
 * 서버가 refresh 쿠키도 지우지만, **이 오리진의 저장소는 우리가 치워야 한다** —
 * 호출부에서 이어서 signOut 을 부른다(authStore 가 토큰·프로필 캐시를 지우고 다른 탭에 알린다).
 */
export function withdraw(): Promise<void> {
  return apiFetch('/users/me', { method: 'DELETE' }, { auth: true });
}

/** 로그인한 기기 한 대. 토큰 해시는 서버가 내보내지 않는다. */
export interface Session {
  sessionId: number;
  userAgent?: string | null;
  ip?: string | null;
  createdAt: string;
  updatedAt: string;
  /** 지금 보고 있는 이 기기인가. */
  current: boolean;
}

/** 로그인한 기기 목록. 최근 활동 순. */
export function getMySessions(): Promise<Session[]> {
  return apiFetch('/users/me/sessions', {}, { auth: true });
}

/** 기기 하나를 로그아웃시킨다. */
export function revokeSession(sessionId: number): Promise<void> {
  return apiFetch(
    `/users/me/sessions/${sessionId}`,
    { method: 'DELETE' },
    { auth: true },
  );
}

/**
 * 모든 기기에서 로그아웃. **지금 이 기기도 포함된다** — 호출한 쪽도 로그아웃 처리해야 한다.
 * 서버가 refresh·힌트 쿠키까지 지우지만, 이 오리진의 저장소는 signOut 이 치운다.
 */
export function revokeAllSessions(): Promise<void> {
  return apiFetch('/users/me/sessions', { method: 'DELETE' }, { auth: true });
}

/**
 * 소셜 연동 시작 토큰. 로그인 상태에서 받아 시작 URL 에 실어 보낸다.
 *
 * **로그인과 같은 진입점(GET /auth/:provider)을 쓴다.** 다른 점은 이 토큰뿐이다 —
 * 서버가 토큰을 열어 "누구에게 붙일 연동인가" 를 알아내고, 서명 state 에 실어 콜백까지 나른다.
 */
export function prepareSocialLink(): Promise<{ linkToken: string }> {
  return apiFetch(
    '/users/me/socials/link-token',
    { method: 'POST' },
    { auth: true },
  );
}

/**
 * 연동 해제. **마지막 로그인 수단이면 서버가 거부한다**(비밀번호도 없고 연동 하나뿐인 경우).
 * 화면에서도 미리 막지만, 판단의 정본은 서버다 — 다른 탭에서 먼저 지웠을 수 있다.
 */
export function unlinkSocial(provider: SocialProvider): Promise<void> {
  return apiFetch(
    `/users/me/socials/${provider}`,
    { method: 'DELETE' },
    { auth: true },
  );
}

/** 연동 시작 URL(전체 페이지 리다이렉트). 끝나면 백엔드가 콜백에 linked=1 을 실어 돌려보낸다. */
export function socialLinkUrl(
  provider: SocialProvider,
  linkToken: string,
): string {
  const params = new URLSearchParams({ link_token: linkToken });
  return `${API_BASE_URL}/auth/${provider}?${params.toString()}`;
}

/** 내 동의 기록. 마이페이지의 열람 항목이다. */
export function getMyConsents(): Promise<ConsentRecord[]> {
  return apiFetch('/users/me/consents', {}, { auth: true });
}

/**
 * 로그아웃. **Bearer 를 붙이지 않는다** — 서버가 refresh 쿠키로 대상을 정하고, 자격증명이
 * 없거나 만료됐어도 쿠키를 지운다. auth:true 로 두면 access 만료 시 401→refresh 춤을 추다가
 * 실패하고, 그 응답엔 쿠키 삭제가 안 실려 세션이 살아남는다.
 */
export function logout(): Promise<void> {
  return apiFetch('/oauth/logout', {
    method: 'DELETE',
    credentials: 'include',
  });
}

/**
 * SSO 인가코드 발급(로그인 상태). 외부 클라이언트의 복귀 URL(return_to)로 넘길 1회용 code 를 받는다.
 * 이메일 로그인 뒤 그 클라이언트로 코드를 실어 돌려보낼 때 쓴다.
 *
 * clientId 를 넘기면 서버가 그 클라이언트의 등록 리디렉션 URI 와 returnTo 를 대조하고,
 * 발급되는 code 에 clientId 를 박는다. 없으면 1st-party(이 인증웹) 복귀로 본다.
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
  // challenge 는 **그 앱이 만든 것**을 그대로 넘긴다. 인증웹이 새로 만들면 verifier 를
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
 * **안 넘기면 백엔드가 자사로 보고 인증웹(/me·/callback)으로 직접 내려놓는다.**
 *
 * clientId 를 함께 넘기면 백엔드가 그 클라이언트의 등록 리디렉션 URI 로 returnTo 를 검증하고
 * state 에 실어 콜백까지 운반한다. 없으면 1st-party 로 보고 AUTH_ALLOWED_ORIGINS 를 본다.
 */
export function socialLoginUrl(
  provider: SocialProvider,
  // 외부 클라이언트 SSO 의 복귀 URL(redirect_uri). 없으면 이 앱의 콜백(1st-party).
  returnTo?: string,
  clientId?: string,
  codeChallenge?: string,
  clientState?: string,
  // 1st-party 복귀 URL. returnTo 미지정(자체 로그인)일 때 콜백에 ret= 로 실린다.
  appReturn?: string,
  /**
   * "로그인 상태 유지" 체크 여부. **여기서 안 보내면 체크박스가 거짓말이 된다** —
   * provider 로 떠나는 순간 이 화면의 상태는 사라지고, 서버는 콜백에서 물어볼 데가 없다.
   * 서버가 서명 state 에 실어 콜백까지 나른다.
   */
  remember?: boolean,
): string {
  // **자사는 그 앱으로 직행한다.** 백엔드가 콜백에서 쿠키를 심고 여기로 보내므로
  // 인증웹을 한 번 더 거칠 이유가 없다(코드 교환이 없다).
  //
  // **돌아갈 곳이 없으면 아무것도 안 보낸다.** 예전엔 자기 콜백을 억지로 적어 보냈는데,
  // 그러면 로그인이 쿠키로 이미 끝났는데도 빈 콜백 페이지를 한 번 찍고 /me 로 튕겼다.
  // 지금은 백엔드가 client_id 가 없으면 자사로 보고 /me·/callback 으로 직접 내려놓는다.
  const params = new URLSearchParams();
  const redirectUri = returnTo ?? appReturn;
  if (redirectUri) params.set('redirect_uri', redirectUri);
  if (clientId) params.set('client_id', clientId);
  if (clientState) params.set('client_state', clientState);
  if (codeChallenge) {
    params.set('code_challenge', codeChallenge);
    params.set('code_challenge_method', 'S256');
  }
  // 켤 때만 보낸다. 서버도 값이 없으면 꺼진 것으로 보므로 기본이 양쪽에서 같다.
  if (remember) params.set('remember', '1');
  return `${API_BASE_URL}/auth/${provider}?${params.toString()}`;
}
