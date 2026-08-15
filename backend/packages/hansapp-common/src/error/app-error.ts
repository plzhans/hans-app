import { CommonErrorCode } from './common-error-code';
import { errorMessageOf } from './error-code-registry';
import type { AppErrorCode } from './error-code-registry';

/**
 * 오류의 계열. **"누구 잘못인가" 를 응용 계층이 정한다.**
 *
 * 이걸 응용 계층이 정하는 이유는 하나다 — 거기가 아는 유일한 자리라서다. 필터는 "병원 id 를
 * 못 찾았다" 가 잘못된 요청인지 DB 가 죽은 것인지 알 수 없다. 응용 계층이 계열을 안 붙이면
 * 필터는 전부 500 으로 뭉갤 수밖에 없고, 그러면 클라이언트 잘못까지 우리 장애로 잡힌다.
 *
 * HTTP 상태로 옮기는 것은 HTTP 를 아는 계층(전역 예외 필터)의 몫이다. 여기엔 HTTP 가 없다 —
 * 응용 계층은 배치·CLI 에서도 도는데 거기엔 상태 코드라는 것이 없다.
 */
export type AppErrorKind =
  /** 요청이 규격을 벗어났다. 같은 요청을 다시 보내도 같은 결과다. */
  | 'bad_request'
  /** 누구인지 모른다. 인증하면 될 수도 있다. */
  | 'unauthorized'
  /** 누구인지는 알지만 권한이 없다. 인증을 다시 해도 소용없다. */
  | 'forbidden'
  | 'not_found'
  /** 지금 상태와 충돌한다(이미 쓰는 client ID 등). */
  | 'conflict'
  | 'rate_limited'
  /** 바깥 의존(공공데이터 API·검색엔진)이 지금 응답하지 않는다. 나중에 되면 된다. */
  | 'unavailable'
  /** 바깥 의존이 제때 답하지 않았다. unavailable 과 달리 **왕복은 했다** — 재시도가 의미 있다. */
  | 'upstream_timeout'
  /** 서버가 깨졌다. 클라이언트가 할 수 있는 것이 없다. */
  | 'internal'
  | 'not_implemented';

/**
 * 서버 잘못으로 보는 계열. 이것들만 error 수준으로 남기고 Sentry 로 올린다.
 *
 * unavailable 이 여기 있는 이유는 "우리가 고쳐야 할 수도 있어서" 다 — 바깥이 죽은 것인지
 * 우리 키가 빠진 것인지는 로그를 봐야 갈리고, 그 로그가 안 남으면 볼 것도 없다.
 */
const SERVER_FAULT_KINDS: ReadonlySet<AppErrorKind> = new Set<AppErrorKind>([
  'internal',
  'unavailable',
  'upstream_timeout',
]);

export interface AppErrorOptions {
  /**
   * 이 자리에서만 다르게 쓸 문구. 안 주면 코드의 기본 문구가 나간다.
   *
   * **웬만하면 안 준다.** 같은 코드인데 받는 말이 호출 경로마다 다르면 클라이언트는 코드가
   * 아니라 문장을 보게 된다. 한도 값처럼 그 자리에서만 아는 값이 문장에 들어갈 때만 준다.
   */
  message?: string;
  /** 원인 예외. 로그·Sentry 에만 쓰이고 응답으로는 절대 나가지 않는다. */
  cause?: unknown;
  /**
   * **클라이언트 개발자에게 보여줄 값.** `error.debug` 를 켠 환경에서만 응답에 실린다.
   *
   * **웬만하면 비운다.** 부르는 쪽이 뭘 잘못했는지 코드와 문장이 이미 말해 주는 자리
   * (한도 초과·잘못된 코드·없는 자원)에는 붙일 이유가 없다 — 갈래를 나눠야 할 만큼
   * 중요하면 그건 debug 값이 아니라 **새 오류 코드**가 할 일이다.
   *
   * 붙일 자리는 **부르는 쪽이 원인을 짐작조차 못 하는 때**다. 서버가 깨진 경우(internal)가
   * 그런데, 그건 필터가 알아서 원문·스택을 실어 준다 — 여기 손으로 담을 일은 드물다.
   *
   * 밖으로 나가는 값이므로 비밀값(토큰 원문·비밀번호·서비스 키)은 절대 담지 않는다.
   */
  debug?: Record<string, unknown>;
}

/**
 * 응용 계층이 던지는 오류의 뿌리.
 *
 * **응용 계층은 NestJS 예외를 던지지 않는다.** 던지는 순간 그 계층이 HTTP 를 알게 되고,
 * 같은 서비스를 배치·CLI 에서 부를 때 400 이라는 말이 아무 뜻도 없어진다. 여기서는
 * 계열(누구 잘못인가)과 코드(무슨 일인가)만 정하고, 상태 코드는 필터가 붙인다.
 *
 * ── 계열과 코드를 클래스가 들고 있다 ─────────────────────────────────────────
 * 자식이 static 으로 선언하고, 생성자가 `new.target` 으로 **실제 만들어진 클래스**의 값을
 * 집는다. 그래서 아무것도 안 넘겨도 그 클래스의 기본 코드로 던져진다.
 *
 *   new BadRequestError()                            BAD_REQUEST
 *   new AppNotFoundError()                           APP_NOT_FOUND (디테일 클래스)
 *   new NotFoundError(CommonErrorCode.REGION_NOT_FOUND)    이 자리만 다른 번호
 *   new ForbiddenError(CommonErrorCode.APP_LIMIT_REACHED, { message: `...(${limit})` })
 *
 * 자주 던지는 코드는 클래스로 굳혀 둔다(domain-error.ts) — 부르는 자리에서 코드를 안 적는다.
 * **계열이 갈리는 코드는 클래스로 못 굳힌다.** 같은 코드가 400 으로도 401 로도 나가는 것들이
 * 있는데(OAUTH_INVALID_GRANT 등), 클래스로 만들면 그중 하나를 골라 버린다. 그런 것은 코드를
 * 인자로 넘긴다.
 *
 * ── 오류가 추적 값을 들고 다니지 않는다 ──────────────────────────────────────
 * 왜 났는지 아는 것은 던지는 자리이고, 거기서 아는 것을 거기서 남기는 편이 옮겨 담는 것보다
 * 정확하다. 그래서 던지기 직전에 `logger.debug(...)` 로 남기고, 오류는 코드만 들고 올라간다.
 * 전역 필터가 코드·상태·경로·요청 id 로 한 줄을 더 남기므로 요청 id 로 둘이 이어진다.
 */
export class AppError extends Error {
  /**
   * 이 클래스가 뜻하는 계열. 자식이 덮어쓴다.
   *
   * 뿌리의 기본이 internal 인 이유는 **모르면 우리 잘못으로 치기 위해서**다. 반대로 두면
   * 계열을 안 붙인 새 오류가 조용히 400 이 되고, 서버가 깨진 것을 클라이언트 잘못으로 센다.
   */
  static readonly kind: AppErrorKind = 'internal';
  /** 코드를 안 넘겼을 때 쓰는 값. 자식이 덮어쓴다. */
  static readonly code: AppErrorCode = CommonErrorCode.INTERNAL_ERROR;

  readonly kind: AppErrorKind;
  /** 응답에 실려 나가는 오류 번호. */
  readonly code: AppErrorCode;
  /** 응답에 실어도 되는 값(debug 를 켠 환경에서만). 보통 비어 있다. */
  readonly debug?: Record<string, unknown>;

  constructor(options?: AppErrorOptions);
  constructor(code: AppErrorCode, options?: AppErrorOptions);
  constructor(codeOrOptions?: AppErrorCode | AppErrorOptions, maybeOptions?: AppErrorOptions) {
    // 번호냐 옵션이냐로 가른다. 번호가 숫자라 옵션 객체와 섞일 일이 없다.
    const passed = typeof codeOrOptions === 'number';
    const given = passed ? codeOrOptions : undefined;
    const options = passed ? maybeOptions : codeOrOptions;

    // 만들어진 것이 자식이면 **자식의** static 을 집는다(부모 것이 아니라).
    const declared = new.target;
    const code = given ?? declared.code;

    super(options?.message ?? errorMessageOf(code), { cause: options?.cause });
    this.name = declared.name;
    this.kind = declared.kind;
    this.code = code;
    this.debug = options?.debug;
  }

  /** 서버 잘못인가. 로그 수준·Sentry 보고 여부가 이걸로 갈린다. */
  get isServerFault(): boolean {
    return SERVER_FAULT_KINDS.has(this.kind);
  }

  /**
   * 메시지를 밖으로 내보내면 안 되는가.
   *
   * **internal 만 가린다.** 거기 담기는 말은 우리가 읽으려고 쓴 것이라(어느 쿼리가 어떤 값으로
   * 깨졌는지) 그대로 나가면 서버 내부가 드러난다. unavailable 은 다르다 — "지금은 안 된다,
   * 언제 다시 되는지" 는 부르는 쪽이 알아야 물러설 수 있는 정보라, 그 자리의 메시지는
   * 처음부터 밖에 나갈 말로 쓴다.
   */
  get hidesMessage(): boolean {
    return this.kind === 'internal';
  }
}

/*
  ── 계열 기준 클래스 ────────────────────────────────────────────────────────────

  **상속이 HTTP 상태가 아니라 "누구 잘못인가" 를 따른다.** TooManyRequestsError 는 429 로
  나가지만 결국 부르는 쪽이 규약을 넘겨 부른 것이라 BadRequestError 의 자식이다. 그래서
  `catch (e) { if (e instanceof BadRequestError) }` 한 줄로 "클라이언트가 고칠 수 있는 것"
  전부를 잡는다 — 상태로 묶었다면 400 과 429 가 남남이라 그 한 줄이 안 된다.

  401·403·404 는 BadRequestError 밑에 넣지 않았다. 요청의 모양이 아니라 **누구인가·있는가**
  를 말하는 것이라, 한 덩어리로 묶으면 저 한 줄이 뜻하는 바가 흐려진다.
*/

/** 요청이 규격·상태에 안 맞는다. **클라이언트 잘못의 기준 클래스다.** */
export class BadRequestError extends AppError {
  static readonly kind: AppErrorKind = 'bad_request';
  static readonly code: AppErrorCode = CommonErrorCode.BAD_REQUEST;
}

/** 지금 상태와 충돌한다. 요청의 모양은 멀쩡하나 지금 상태가 받아 주지 않는다. */
export class ConflictError extends BadRequestError {
  static readonly kind: AppErrorKind = 'conflict';
  static readonly code: AppErrorCode = CommonErrorCode.CONFLICT;
}

/** 너무 자주 불렀다. **429 의 기준 클래스** — 사유가 있는 것들이 이걸 상속한다. */
export class TooManyRequestsError extends BadRequestError {
  static readonly kind: AppErrorKind = 'rate_limited';
  static readonly code: AppErrorCode = CommonErrorCode.RATE_LIMITED;
}

/** 누구인지 모른다. 인증하면 될 수도 있다. */
export class UnauthorizedError extends AppError {
  static readonly kind: AppErrorKind = 'unauthorized';
  static readonly code: AppErrorCode = CommonErrorCode.UNAUTHORIZED;
}

/** 누구인지는 알지만 권한이 없다. 인증을 다시 해도 소용없다. */
export class ForbiddenError extends AppError {
  static readonly kind: AppErrorKind = 'forbidden';
  static readonly code: AppErrorCode = CommonErrorCode.FORBIDDEN;
}

/** 찾는 것이 없다. */
export class NotFoundError extends AppError {
  static readonly kind: AppErrorKind = 'not_found';
  static readonly code: AppErrorCode = CommonErrorCode.NOT_FOUND;
}

/** 바깥 의존이 지금 응답하지 않는다. **바깥 장애의 기준 클래스다.** */
export class UnavailableError extends AppError {
  static readonly kind: AppErrorKind = 'unavailable';
  static readonly code: AppErrorCode = CommonErrorCode.SERVICE_UNAVAILABLE;
}

/** 바깥 의존이 제때 답하지 않았다. 왕복은 했으므로 재시도가 의미 있다. */
export class UpstreamTimeoutError extends UnavailableError {
  static readonly kind: AppErrorKind = 'upstream_timeout';
  static readonly code: AppErrorCode = CommonErrorCode.UPSTREAM_TIMEOUT;
}

/**
 * 서버가 깨졌다. **서버 잘못의 기준 클래스다.**
 *
 * **메시지는 응답으로 나가지 않는다** — 필터가 500 을 고정 문구로 덮는다. 그러니 여기 메시지는
 * 밖에 보일 말이 아니라 우리가 읽을 말로 쓴다(어느 쿼리가 어떤 값으로 깨졌는지). 다른 계열과
 * 달리 **문구를 적어 두는 편이 낫다** — 기본 문구는 아무것도 알려 주지 않는다.
 */
export class InternalError extends AppError {
  static readonly kind: AppErrorKind = 'internal';
  static readonly code: AppErrorCode = CommonErrorCode.INTERNAL_ERROR;
}

/** 아직 만들지 않았다. 서버가 못 하는 것이라 서버 잘못 쪽에 둔다. */
export class NotImplementedError extends InternalError {
  static readonly kind: AppErrorKind = 'not_implemented';
  static readonly code: AppErrorCode = CommonErrorCode.NOT_IMPLEMENTED;
}
