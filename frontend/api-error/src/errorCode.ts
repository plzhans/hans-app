/**
 * HansApp 플랫폼이 분기에 쓰는 백엔드 오류 번호.
 *
 * 정본은 백엔드의 계층별 번호표다 — `hansapp-auth-application/src/error/auth-error-code.ts`,
 * `hansapp-application/src/error/service-error-code.ts`. 공통 번호(10000대)는
 * `hansapp-common/src/error/common-error-code.ts` 에 있다.
 *
 * ── 왜 여기 다시 적나 ─────────────────────────────────────────────────────────
 * 백엔드 패키지를 프론트가 import 할 수 없다. 대신 이 값은 조용히 어긋나지 않는다:
 * 번호는 대외 계약이라 **뜻이 달라지면 새 번호를 딴다**는 규칙이 있어서, 한 번 맞춰 두면
 * 서버가 문구를 다듬어도 여기가 틀려지지 않는다. 영문 문장을 키로 쓰던 예전 방식은 그
 * 반대였다 — 서버에서 한 글자만 고쳐도 매핑이 조용히 안 맞게 됐다.
 *
 * ── 무엇을 적나 ───────────────────────────────────────────────────────────────
 * **플랫폼이 실제로 분기에 쓰는 것만** 적는다. 백엔드 표를 통째로 옮기면 안 쓰는 번호까지
 * 따라다니고, 그중 하나가 틀려도 아무도 모른다. 쓰는 것만 있으면 틀리는 순간 화면에서 드러난다.
 *
 * ── 누가 쓰나 ─────────────────────────────────────────────────────────────────
 * 인증웹(hansapp-auth)·포털(hansapp-web)·관리자 콘솔(hansapp-admin). **같은 플랫폼이라
 * 같은 표를 본다** — 세 곳에 번호를 따로 적어 두면 한 곳만 고쳐지는 날이 온다.
 *
 * **medifinder-web 은 여기 없다.** 다른 제품이고 부르는 API 도 달라서, 그쪽은 자기가 쓰는
 * 번호를 자기 안에서 관리한다.
 */
export const ErrorCode = {
  // ── 인증 ─────────────────────────────────────────────────────────────────────
  AUTH_INVALID_CREDENTIALS: 11000,
  AUTH_ACCOUNT_DISABLED: 11001,
  AUTH_SESSION_EXPIRED: 11004,
  AUTH_EMAIL_ALREADY_REGISTERED: 11007,
  AUTH_VERIFICATION_CODE_REQUIRED: 11008,
  AUTH_VERIFICATION_CODE_INVALID: 11009,
  /** 시간당 발송 상한. 쿨다운(11012)과 기다리는 시간이 다르다. */
  AUTH_VERIFICATION_EMAIL_RATE_LIMITED: 11011,
  /** 직전 발송 쿨다운. 몇 초만 기다리면 된다. */
  AUTH_VERIFICATION_RESEND_TOO_SOON: 11012,
  AUTH_CONSENT_REQUIRED: 11014,

  // ── 소셜 로그인 ──────────────────────────────────────────────────────────────
  SOCIAL_PROFILE_UNAVAILABLE: 12002,
  SOCIAL_LINK_CONFLICT: 12004,
  SOCIAL_PROVIDER_NOT_LINKED: 12005,
  SOCIAL_UNLINK_LAST_METHOD: 12006,
  SOCIAL_FLOW_INVALID: 12007,

  /*
    ── 관리자 콘솔(20000대) ────────────────────────────────────────────────────
    관리자 API 는 공개 API 와 **다른 계약**이라 번호 대역이 갈린다. 여기 적힌 것은
    관리자 콘솔(hansapp-admin)만 쓴다 — 인증웹·포털은 이 번호를 볼 일이 없다.

    관리자 화면은 운영자가 보는 곳이라 영어 원문이 그대로 보여도 못 읽지는 않는다.
    그래서 **운영자가 할 일이 갈리는 것만** 옮겼다 — 무엇을 고쳐야 하는지가 문장에서
    바로 나와야 하는 자리들이다.
  */

  // 로그인·세션
  ADMIN_INVALID_CREDENTIALS: 20000,
  ADMIN_ACCOUNT_INACTIVE: 20001,
  ADMIN_CURRENT_PASSWORD_MISMATCH: 20002,
  ADMIN_PASSWORD_UNCHANGED: 20003,
  ADMIN_TOKEN_INVALID: 20004,
  ADMIN_SESSION_INVALID: 20006,
  ADMIN_SESSION_EXPIRED: 20008,
  /** 초기화된 비밀번호다. 바꾸기 전에는 다른 화면이 열리지 않는다. */
  ADMIN_PASSWORD_CHANGE_REQUIRED: 20012,
  /** 마스터 키가 없어 비밀값을 저장할 수 없다. 서버 설정 문제다. */
  ADMIN_SECRET_STORAGE_UNAVAILABLE: 20014,
  ADMIN_PASSWORD_RESET_LINK_INVALID: 20015,

  // 관리자 계정
  ADMIN_NOT_FOUND: 21000,
  ADMIN_EMAIL_INVALID: 21001,
  ADMIN_EMAIL_ALREADY_REGISTERED: 21002,
  ADMIN_ROLE_TOO_HIGH: 21003,
  /** 마지막 시스템 관리자·마지막 계정. 지우면 되돌릴 사람이 없다. */
  ADMIN_LAST_SYSTEM_ADMIN: 21004,
  ADMIN_LAST_ACCOUNT: 21005,
  ADMIN_SELF_DELETE: 21006,
  ADMIN_SELF_PASSWORD_FLOW: 21007,
  /** 지우기는 됐는데 캐시가 남았다. 그 기기가 TTL 만큼 더 통한다. */
  ADMIN_CACHE_PARTIALLY_CLEARED: 21010,

  // 관리자 소셜 로그인
  ADMIN_GOOGLE_SIGN_IN_FAILED: 22000,
  ADMIN_GOOGLE_NOT_CONFIGURED: 22001,
  ADMIN_SOCIAL_FLOW_INVALID: 22002,

  // 앱 심사
  ADMIN_APP_STATUS_INVALID: 23001,

  // 게시판
  ADMIN_BOARD_NAME_IN_USE: 24001,
  ADMIN_BOARD_NAME_INVALID: 24002,
  ADMIN_BOARD_SECRET_NOT_ALLOWED: 24004,

  // LLM 키·모델
  ADMIN_LLM_KEY_DEFAULT_LOCKED: 25003,
  ADMIN_LLM_MODEL_DEFAULT_LOCKED: 25006,
  ADMIN_LLM_PROVIDER_UNREACHABLE: 25007,

  // 설정·로그
  ADMIN_SETTING_READ_ONLY: 26002,
  ADMIN_SETTING_VALUE_INVALID: 26003,
  ADMIN_LOG_RANGE_REQUIRED: 28000,

  // 회원 관리
  ADMIN_USER_NOT_FOUND: 27000,
  /** 세션은 지웠는데 캐시가 남았다. */
  ADMIN_USER_CACHE_PARTIALLY_CLEARED: 27002,
} as const;
