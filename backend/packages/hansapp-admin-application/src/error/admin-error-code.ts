import { message, registerErrorCodes } from '@hansapp/common';

/**
 * 관리자 계층이 내보내는 오류 번호(20000대).
 *
 * **번호는 계층이 아니라 API 계약의 일부다.** 이 계층이 관리자 API(hansapp-admin-api)로
 * 내보내는 사유들이라 여기 있다 — 공개 API 는 자기 표를 따로 들고 있어서 이 번호를 보지 않고,
 * 반대도 마찬가지다. 대역 배정은 `@hansapp/common` 의 CommonErrorCode 주석에 있다.
 *
 * ── 소비자가 다르다 ───────────────────────────────────────────────────────────
 * 이 번호를 읽는 것은 관리자 콘솔뿐이다. 외부 개발자에게 나가지 않으므로 공개 API 만큼
 * 문구를 다듬을 이유는 없지만, **번호를 바꾸지 않는 규칙은 같다** — 콘솔이 이 값으로 분기한다.
 *
 * ── 대역 ──────────────────────────────────────────────────────────────────────
 *   20000  관리자 인증·세션        25000  LLM 키·모델
 *   21000  관리자 계정 관리        26000  설정·유지보수
 *   22000  관리자 소셜 로그인      27000  회원 관리
 *   23000  앱 심사                28000  로그 조회
 *   24000  커뮤니티(게시판)
 *
 * ── 새 번호를 다는 법 ─────────────────────────────────────────────────────────
 * 한 줄이면 된다. 문구를 안 적으면 **이름이 그대로 문구가 된다.**
 */
export class AdminErrorCode {
  // ── 관리자 인증·세션 ─────────────────────────────────────────────────────────
  @message('Invalid email or password.')
  static readonly ADMIN_INVALID_CREDENTIALS = 20000;
  @message('Account is not active.')
  static readonly ADMIN_ACCOUNT_INACTIVE = 20001;
  @message('Current password does not match.')
  static readonly ADMIN_CURRENT_PASSWORD_MISMATCH = 20002;
  @message('New password must differ from the current one.')
  static readonly ADMIN_PASSWORD_UNCHANGED = 20003;
  @message('Invalid or expired token.')
  static readonly ADMIN_TOKEN_INVALID = 20004;
  @message('Authentication token is required.')
  static readonly ADMIN_TOKEN_REQUIRED = 20005;
  @message('Session is no longer valid.')
  static readonly ADMIN_SESSION_INVALID = 20006;
  @message('Session not found.')
  static readonly ADMIN_SESSION_NOT_FOUND = 20007;
  @message('Session expired. Please sign in again.')
  static readonly ADMIN_SESSION_EXPIRED = 20008;
  @message('Invalid refresh token.')
  static readonly ADMIN_REFRESH_TOKEN_INVALID = 20009;
  @message('Refresh token mismatch.')
  static readonly ADMIN_REFRESH_TOKEN_MISMATCH = 20010;
  @message('Refresh token cookie is required.')
  static readonly ADMIN_REFRESH_COOKIE_REQUIRED = 20011;
  /** 초기화된 비밀번호로 들어왔다. 바꾸기 전에는 다른 화면을 열지 못한다. */
  @message('Password change required.')
  static readonly ADMIN_PASSWORD_CHANGE_REQUIRED = 20012;
  @message('No admin authentication context.')
  static readonly ADMIN_UNAUTHORIZED = 20013;
  /** 비밀값을 넣고 꺼낼 마스터 키(appSecretEncryption)가 이 서버에 없다. */
  @message('Secret storage is not configured on this server.')
  static readonly ADMIN_SECRET_STORAGE_UNAVAILABLE = 20014;
  /**
   * 비밀번호 재설정 링크가 못 쓰는 것이다.
   *
   * **사유를 가리지 않는다** — 만료됐든, 이미 썼든, 없는 값이든 하나다. 토큰을 쥔 사람에게는
   * 어느 쪽이든 "다시 받으세요" 로 끝나고, 갈라 주면 유효한 토큰을 찾아 헤매는 쪽에만 단서가 된다.
   */
  @message('This password reset link is invalid or has expired.')
  static readonly ADMIN_PASSWORD_RESET_LINK_INVALID = 20015;

  // ── 관리자 계정 관리 ─────────────────────────────────────────────────────────
  @message('Admin not found.')
  static readonly ADMIN_NOT_FOUND = 21000;
  @message('Not a valid email address.')
  static readonly ADMIN_EMAIL_INVALID = 21001;
  @message('Email already registered.')
  static readonly ADMIN_EMAIL_ALREADY_REGISTERED = 21002;
  /** 자기보다 높은 등급을 건드리거나 자기보다 높은 등급을 주려 했다. */
  @message('Cannot act on a role higher than your own.')
  static readonly ADMIN_ROLE_TOO_HIGH = 21003;
  /** 마지막 시스템 관리자다. 내리면 그 등급을 되돌릴 사람이 없어진다. */
  @message('Cannot remove the last system admin — no one could restore that role afterwards.')
  static readonly ADMIN_LAST_SYSTEM_ADMIN = 21004;
  /** 마지막 관리자 계정이다. 지우면 아무도 로그인할 수 없다. */
  @message('Cannot remove the last admin account — no one could sign in afterwards.')
  static readonly ADMIN_LAST_ACCOUNT = 21005;
  @message('You cannot delete your own account.')
  static readonly ADMIN_SELF_DELETE = 21006;
  @message('Use the password change flow for your own account.')
  static readonly ADMIN_SELF_PASSWORD_FLOW = 21007;
  @message('Unsupported language.')
  static readonly ADMIN_LOCALE_UNSUPPORTED = 21008;
  @message('Unknown time zone.')
  static readonly ADMIN_TIME_ZONE_UNKNOWN = 21009;
  /** 지우기는 했는데 캐시 일부가 안 지워졌다. 그 기기가 캐시 TTL 만큼 더 통한다. */
  @message('Some cache entries could not be cleared.')
  static readonly ADMIN_CACHE_PARTIALLY_CLEARED = 21010;

  // ── 관리자 소셜 로그인 ───────────────────────────────────────────────────────
  /** **왜 실패했는지는 밖에 안 알린다** — 계정이 있는지 떠보는 통로가 된다. */
  @message('Google sign-in failed.')
  static readonly ADMIN_GOOGLE_SIGN_IN_FAILED = 22000;
  @message('Google sign-in is not configured.')
  static readonly ADMIN_GOOGLE_NOT_CONFIGURED = 22001;
  @message('Stale sign-in flow. Please try again.')
  static readonly ADMIN_SOCIAL_FLOW_INVALID = 22002;
  @message('Invalid link ticket.')
  static readonly ADMIN_SOCIAL_TICKET_INVALID = 22003;

  // ── 앱 심사 ──────────────────────────────────────────────────────────────────
  @message('App not found.')
  static readonly ADMIN_APP_NOT_FOUND = 23000;
  /** 지금 상태에서 할 수 없는 전이다(차단된 앱을 승인하려는 등). */
  @message('The app is not in a state that allows this.')
  static readonly ADMIN_APP_STATUS_INVALID = 23001;
  @message('Rejection reason is required.')
  static readonly ADMIN_APP_REJECTION_REASON_REQUIRED = 23002;
  @message('Rejection reason is too long.')
  static readonly ADMIN_APP_REJECTION_REASON_TOO_LONG = 23003;

  // ── 커뮤니티(게시판) ─────────────────────────────────────────────────────────
  @message('Board not found.')
  static readonly ADMIN_BOARD_NOT_FOUND = 24000;
  @message('Board name already exists.')
  static readonly ADMIN_BOARD_NAME_IN_USE = 24001;
  @message('Board name must be 2-50 characters of lowercase letters, digits, or hyphens.')
  static readonly ADMIN_BOARD_NAME_INVALID = 24002;
  @message('Post not found.')
  static readonly ADMIN_BOARD_POST_NOT_FOUND = 24003;
  @message('This board does not allow secret posts. Enable it on the board first.')
  static readonly ADMIN_BOARD_SECRET_NOT_ALLOWED = 24004;

  // ── LLM 키·모델 ──────────────────────────────────────────────────────────────
  @message('Unsupported LLM provider.')
  static readonly ADMIN_LLM_PROVIDER_UNSUPPORTED = 25000;
  @message('LLM key not found.')
  static readonly ADMIN_LLM_KEY_NOT_FOUND = 25001;
  @message('The LLM key configuration is not valid.')
  static readonly ADMIN_LLM_KEY_INVALID = 25002;
  /** 기본 키는 다른 키를 기본으로 세운 뒤에야 끄거나 지울 수 있다. */
  @message('Set another key as the default first.')
  static readonly ADMIN_LLM_KEY_DEFAULT_LOCKED = 25003;
  @message('LLM model not found.')
  static readonly ADMIN_LLM_MODEL_NOT_FOUND = 25004;
  @message('The LLM model configuration is not valid.')
  static readonly ADMIN_LLM_MODEL_INVALID = 25005;
  /** 기본 모델은 다른 모델을 기본으로 세운 뒤에야 끄거나 지울 수 있다. */
  @message('Set another model as the default first.')
  static readonly ADMIN_LLM_MODEL_DEFAULT_LOCKED = 25006;
  /** 업체에 모델 목록을 물었는데 답을 못 받았다. 우리 설정이 아니라 저쪽 사정일 수 있다. */
  @message('Could not fetch the model list from the provider.')
  static readonly ADMIN_LLM_PROVIDER_UNREACHABLE = 25007;

  // ── 설정·유지보수 ────────────────────────────────────────────────────────────
  @message('Unknown setting group.')
  static readonly ADMIN_SETTING_GROUP_NOT_FOUND = 26000;
  @message('The key does not belong to this group.')
  static readonly ADMIN_SETTING_KEY_INVALID = 26001;
  @message('Read-only setting.')
  static readonly ADMIN_SETTING_READ_ONLY = 26002;
  @message('The value is not valid for this setting.')
  static readonly ADMIN_SETTING_VALUE_INVALID = 26003;
  @message('Unknown cache target.')
  static readonly ADMIN_CACHE_TARGET_UNKNOWN = 26004;

  // ── 관리자 도구(색인·시드·내보내기) ──────────────────────────────────────────
  /** 지원하지 않는 조회 조합을 골랐다(DB 모드에서 필터 등). */
  @message('That option combination is not supported yet.')
  static readonly ADMIN_QUERY_UNSUPPORTED = 26005;
  /** 이미 채워진 파일을 덮어쓰려 했다. 되돌릴 수 없어 막는다. */
  @message('The target file already has content. Overwriting would lose it.')
  static readonly ADMIN_EXPORT_WOULD_OVERWRITE = 26006;
  /** 시드가 서로 어긋난다(같은 키가 두 곳에 있는 등). */
  @message('The seed is inconsistent.')
  static readonly ADMIN_SEED_INCONSISTENT = 26007;
  /** 검색 인덱스·alias 가 색인할 수 없는 상태다. */
  @message('The search index is not in a usable state.')
  static readonly ADMIN_SEARCH_INDEX_INVALID = 26008;

  // ── 회원 관리 ────────────────────────────────────────────────────────────────
  @message('User not found.')
  static readonly ADMIN_USER_NOT_FOUND = 27000;
  @message('Session not found.')
  static readonly ADMIN_USER_SESSION_NOT_FOUND = 27001;
  /** 세션은 지웠는데 캐시 일부가 안 지워졌다. 그 기기가 캐시 TTL 만큼 더 통한다. */
  @message('Sessions were deleted but some cache entries could not be cleared.')
  static readonly ADMIN_USER_CACHE_PARTIALLY_CLEARED = 27002;

  // ── 로그 조회 ────────────────────────────────────────────────────────────────
  /** 기간 없이 전부 훑으면 로그 표를 통째로 읽는다. 시작 시각이나 요청 id 가 있어야 한다. */
  @message('A start time (from) is required.')
  static readonly ADMIN_LOG_RANGE_REQUIRED = 28000;
}

// **클래스 바로 밑에서 등록한다.** 자동화할 수 없는 이유는 registerErrorCodes 주석에 있다.
registerErrorCodes('AdminErrorCode', AdminErrorCode);
