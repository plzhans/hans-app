import { message, registerErrorCodes } from '@hansapp/common';

/**
 * 인증 계층이 내보내는 오류 번호(11000~15000).
 *
 * **번호는 계층이 아니라 API 계약의 일부다.** 이 계층이 공개 API(hansapp-api)로 내보내는
 * 사유들이라 여기 있다 — 관리자 API 는 자기 표를 따로 들고 있어서 이 번호를 보지 않는다.
 * 대역 배정은 `@hansapp/common` 의 CommonErrorCode 주석에 있다.
 *
 * ── 새 번호를 다는 법 ─────────────────────────────────────────────────────────
 * 한 줄이면 된다. 문구를 안 적으면 **이름이 그대로 문구가 된다** — 급할 때 번호만 따고
 * 나중에 문장을 다듬어도 응답이 비지 않는다.
 *
 *   static readonly AUTH_TOKEN_INVALID = 11002;    → 'AUTH_TOKEN_INVALID'
 *
 *   @message('Invalid or expired token.')
 *   static readonly AUTH_TOKEN_INVALID = 11002;    → 'Invalid or expired token.'
 *
 * ── 번호는 대외 계약이다 ──────────────────────────────────────────────────────
 * 한 번 내보낸 번호는 뜻을 바꾸지도, 다른 사유에 다시 쓰지도 않는다 — 사유가 달라지면
 * 새 번호를 딴다. **쓰지 않게 된 번호도 지우지 않고 비워 둔다**(재사용 금지).
 *
 * 반대로 **문구는 바뀔 수 있다.** 그래서 부르는 쪽은 문장이 아니라 번호로 분기해야 한다.
 */
export class AuthErrorCode {
  // ── 인증 ─────────────────────────────────────────────────────────────────────
  @message('Invalid email or password.')
  static readonly AUTH_INVALID_CREDENTIALS = 11000;
  @message('Account is not available.')
  static readonly AUTH_ACCOUNT_DISABLED = 11001;
  /** 토큰이 위조됐거나 우리가 발급한 것이 아니다 → 재로그인. */
  @message('Invalid or expired token.')
  static readonly AUTH_TOKEN_INVALID = 11002;
  /** 토큰이 만료됐을 뿐 정상 발급분이다 → 재발급. */
  @message('Token has expired.')
  static readonly AUTH_TOKEN_EXPIRED = 11003;
  @message('Session expired. Please sign in again.')
  static readonly AUTH_SESSION_EXPIRED = 11004;
  @message('Invalid refresh token.')
  static readonly AUTH_REFRESH_TOKEN_INVALID = 11005;
  @message('Email is not verified.')
  static readonly AUTH_EMAIL_NOT_VERIFIED = 11006;
  @message('Email already registered.')
  static readonly AUTH_EMAIL_ALREADY_REGISTERED = 11007;
  /** 코드를 아예 안 보냈다. 틀린 것과 다르다 — 화면은 "입력하세요" 를 띄운다. */
  @message('Verification code is required.')
  static readonly AUTH_VERIFICATION_CODE_REQUIRED = 11008;
  @message('Invalid or expired verification code.')
  static readonly AUTH_VERIFICATION_CODE_INVALID = 11009;
  @message('Verification code has expired.')
  static readonly AUTH_VERIFICATION_CODE_EXPIRED = 11010;
  /** 시간당 발송 상한을 넘겼다. 한참 기다려야 한다. */
  @message('Too many verification emails. Please try again later.')
  static readonly AUTH_VERIFICATION_EMAIL_RATE_LIMITED = 11011;
  /** 직전 발송 쿨다운 중이다. 몇 초만 기다리면 된다 — 상한 초과와 기다리는 시간이 다르다. */
  @message('A code was sent recently. Please wait before requesting another.')
  static readonly AUTH_VERIFICATION_RESEND_TOO_SOON = 11012;
  @message('Password does not meet the requirements.')
  static readonly AUTH_PASSWORD_POLICY_VIOLATION = 11013;
  @message('Consent is required.')
  static readonly AUTH_CONSENT_REQUIRED = 11014;
  /** 서명 키를 못 읽었다. 요청 잘못이 아니라 서버 문제다. */
  @message('Signing key is unavailable.')
  static readonly AUTH_KEY_UNAVAILABLE = 11015;
  /** 끊으려는 기기(세션)가 없거나 내 것이 아니다. 이미 로그아웃된 기기일 수 있다. */
  @message('Session not found.')
  static readonly AUTH_SESSION_NOT_FOUND = 11016;

  // ── 소셜 로그인 ──────────────────────────────────────────────────────────────
  @message('Unsupported social provider.')
  static readonly SOCIAL_PROVIDER_UNSUPPORTED = 12000;
  @message('Social provider is not configured.')
  static readonly SOCIAL_PROVIDER_NOT_CONFIGURED = 12001;
  @message('Social profile is unavailable.')
  static readonly SOCIAL_PROFILE_UNAVAILABLE = 12002;
  @message('Invalid or expired token.')
  static readonly SOCIAL_TICKET_INVALID = 12003;
  @message('Social account already linked.')
  static readonly SOCIAL_LINK_CONFLICT = 12004;
  @message('Provider is not linked.')
  static readonly SOCIAL_PROVIDER_NOT_LINKED = 12005;
  /** 마지막 로그인 수단이라 해제할 수 없다. 비밀번호를 먼저 세워야 한다. */
  @message('Cannot unlink the last sign-in method. Set a password first.')
  static readonly SOCIAL_UNLINK_LAST_METHOD = 12006;
  /** 소셜 로그인 흐름이 만료됐거나 이 브라우저의 것이 아니다. */
  @message('Stale sign-in flow. Please try again.')
  static readonly SOCIAL_FLOW_INVALID = 12007;

  // ── OAuth 토큰 엔드포인트 ────────────────────────────────────────────────────
  @message('Unknown client.')
  static readonly OAUTH_INVALID_CLIENT = 13000;
  @message('Authorization code is not usable.')
  static readonly OAUTH_INVALID_GRANT = 13001;
  @message('Unsupported grant_type.')
  static readonly OAUTH_UNSUPPORTED_GRANT_TYPE = 13002;
  @message('Invalid scope.')
  static readonly OAUTH_INVALID_SCOPE = 13003;
  @message('redirect_uri not allowed.')
  static readonly OAUTH_INVALID_REDIRECT_URI = 13004;

  // ── 사용자 ───────────────────────────────────────────────────────────────────
  @message('User not found.')
  static readonly USER_NOT_FOUND = 14000;
  @message('User already exists.')
  static readonly USER_ALREADY_EXISTS = 14001;

  // ── 앱 등록·서비스 키 ────────────────────────────────────────────────────────
  @message('App not found.')
  static readonly APP_NOT_FOUND = 15000;
  @message('App limit reached.')
  static readonly APP_LIMIT_REACHED = 15001;
  /** 지금 상태에서 할 수 없는 전이다(심사중이 아닌 앱을 반려하는 등). */
  @message('The app is not in a state that allows this.')
  static readonly APP_STATUS_INVALID = 15002;
  @message('Insufficient permissions.')
  static readonly APP_ACCESS_DENIED = 15003;
  @message('App member not found.')
  static readonly APP_MEMBER_NOT_FOUND = 15004;
  @message('API key not found.')
  static readonly APP_KEY_NOT_FOUND = 15005;
  @message('Service key limit reached.')
  static readonly APP_KEY_LIMIT_REACHED = 15006;
  @message('Client not found.')
  static readonly APP_CLIENT_NOT_FOUND = 15007;
  @message('Client ID already in use.')
  static readonly APP_CLIENT_ID_IN_USE = 15008;
  @message('Unsupported client type.')
  static readonly APP_CLIENT_TYPE_UNSUPPORTED = 15009;
  /** 이 앱에 열려 있지 않은 API 를 불렀다. */
  @message('This API is not enabled for the app.')
  static readonly APP_API_ACCESS_DENIED = 15010;
  /** 서비스 키도 X-Client-Id 도 없이 불렀다. */
  @message('Service key (Authorization: Bearer) or X-Client-Id header is required.')
  static readonly APP_CREDENTIALS_REQUIRED = 15011;
  /** 서비스 키가 형식에 안 맞거나 우리가 발급한 것이 아니다. */
  @message('Invalid service key.')
  static readonly APP_KEY_INVALID = 15012;
  @message('Invalid client.')
  static readonly APP_CLIENT_INVALID = 15013;
  /** 앱이 아직 승인 전이다. **키는 진짜다** — 승인만 나면 통한다. */
  @message('This app is pending approval.')
  static readonly APP_PENDING_APPROVAL = 15014;
  @message('Origin not allowed.')
  static readonly APP_ORIGIN_NOT_ALLOWED = 15015;
  @message('LLM key not found.')
  static readonly APP_LLM_KEY_NOT_FOUND = 15016;
  @message('The LLM key configuration is not valid.')
  static readonly APP_LLM_KEY_INVALID = 15017;
  /** 이 서버에 업체 키 보관함이 준비되지 않았다(마스터 키 미설정). */
  @message('Provider key storage is not configured on this server.')
  static readonly APP_LLM_KEY_STORAGE_UNAVAILABLE = 15018;
}

// **클래스 바로 밑에서 등록한다.** 자동화할 수 없는 이유는 registerErrorCodes 주석에 있다.
registerErrorCodes('AuthErrorCode', AuthErrorCode);
