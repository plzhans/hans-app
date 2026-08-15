import { BadRequestError, NotFoundError, UnauthorizedError } from '@hansapp/common';
import type { AppErrorCode } from '@hansapp/common';

import { AuthErrorCode } from './auth-error-code';

/**
 * 인증 계층에서 자주 던지는 오류를 클래스로 굳혀 둔 것. **번호를 자리마다 안 적으려고 있다.**
 *
 * 계열 기준 클래스(BadRequestError 등)를 상속하고 번호만 바꿔 단다. 그래서
 * `catch (e) { if (e instanceof BadRequestError) }` 는 여기 있는 것들도 그대로 잡는다.
 *
 * ── 무엇을 여기 두나 ──────────────────────────────────────────────────────────
 * **여러 곳에서 같은 계열로 던지는 번호만** 둔다. 한 번만 쓰는 번호까지 클래스로 만들면
 * export 이름만 늘고, 번호를 하나 더할 때마다 클래스도 같이 만들어야 한다 — 그럴 자리는
 * `new NotFoundError(AuthErrorCode.APP_MEMBER_NOT_FOUND)` 로 번호를 넘기면 된다.
 *
 * **계열이 갈리는 번호는 여기 못 온다.** OAUTH_INVALID_GRANT 는 자리에 따라 400 이기도
 * 401 이기도 한데(PKCE 형식 위반이냐, 코드가 안 맞느냐), 클래스로 만들면 둘 중 하나로
 * 굳어 버린다. 그런 번호는 계속 인자로 넘긴다.
 */

/* ── 없음(404) ──────────────────────────────────────────────────────────────── */

/** 앱을 못 찾았다. */
export class AppNotFoundError extends NotFoundError {
  static readonly code: AppErrorCode = AuthErrorCode.APP_NOT_FOUND;
}

/** 앱 클라이언트(웹·iOS·안드로이드 등록분)를 못 찾았다. */
export class AppClientNotFoundError extends NotFoundError {
  static readonly code: AppErrorCode = AuthErrorCode.APP_CLIENT_NOT_FOUND;
}

/* ── 잘못된 요청(400) ───────────────────────────────────────────────────────── */

/** 동의가 없거나 판이 지났다. */
export class ConsentRequiredError extends BadRequestError {
  static readonly code: AppErrorCode = AuthErrorCode.AUTH_CONSENT_REQUIRED;
}

/** redirect_uri 가 등록된 것과 다르다. */
export class InvalidRedirectUriError extends BadRequestError {
  static readonly code: AppErrorCode = AuthErrorCode.OAUTH_INVALID_REDIRECT_URI;
}

/** 인증 코드가 틀렸거나 시간이 지났다. */
export class VerificationCodeInvalidError extends BadRequestError {
  static readonly code: AppErrorCode = AuthErrorCode.AUTH_VERIFICATION_CODE_INVALID;
}

/** 소셜 로그인 흐름이 만료됐거나 이 브라우저의 것이 아니다. */
export class SocialFlowInvalidError extends BadRequestError {
  static readonly code: AppErrorCode = AuthErrorCode.SOCIAL_FLOW_INVALID;
}

/* ── 인증 실패(401) ─────────────────────────────────────────────────────────── */

/** 토큰이 위조됐거나 우리가 발급한 것이 아니다. */
export class TokenInvalidError extends UnauthorizedError {
  static readonly code: AppErrorCode = AuthErrorCode.AUTH_TOKEN_INVALID;
}

/** 세션이 끝났다. 다시 로그인해야 한다. */
export class SessionExpiredError extends UnauthorizedError {
  static readonly code: AppErrorCode = AuthErrorCode.AUTH_SESSION_EXPIRED;
}

/** 서비스 키가 형식에 안 맞거나 우리가 발급한 것이 아니다. */
export class ServiceKeyInvalidError extends UnauthorizedError {
  static readonly code: AppErrorCode = AuthErrorCode.APP_KEY_INVALID;
}
