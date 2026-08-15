import { Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
// catch() 가 데코레이터를 달면서 emitDecoratorMetadata 대상이 됐다. 시그니처에 쓰는 타입은
// `import type` 이어야 한다(isolatedModules + emitDecoratorMetadata 조합의 요구, TS1272).
import type { ArgumentsHost } from '@nestjs/common';
import type { Request, Response } from 'express';
import * as Sentry from '@sentry/nestjs';
import { AppError, CommonErrorCode } from '@hansapp/common';
import type { AppErrorCode, AppErrorKind } from '@hansapp/common';

import type { RequestWithId } from './request-id.middleware';

/**
 * 전역 예외 필터. **오류가 밖으로 나가는 유일한 문**이다.
 *
 * 여기서 세 가지를 한다.
 *
 * 1. **상태 코드로 옮긴다.** 응용 계층은 계열(누구 잘못인가)만 정하고 HTTP 를 모른다.
 *    HTTP 를 아는 것은 이 계층뿐이라 번역도 여기서 한 번만 한다.
 *
 *    **상태는 기준 클래스가, 세부는 errorCode 가 말한다.** NotFoundError 로 던졌으면 404 이고,
 *    그중 무엇이 없었는지는 `errorCode: 15000`(APP_NOT_FOUND)으로 간다 — 상태를 더 쪼개 봐야
 *    클라이언트가 분기할 수 없고, 번호를 늘리는 것은 이미 나간 계약을 깨지 않는다.
 *
 *    로그에는 번호와 함께 그 번호의 문구가 남는다(logMessage) — 숫자만 보고 표를 찾지 않게.
 * 2. **로그를 남긴다.** 던지는 자리마다 logger 를 부르면 같은 사건이 두 줄로 남고
 *    한쪽만 고쳐지며 어긋난다. 여기서 코드·경로·요청 id 를 한 줄로 남긴다.
 * 3. **Sentry 로 보낸다.** 전역 필터가 예외를 잡아 응답으로 바꿔 버리면 Sentry 의 기본
 *    미처리 예외 훅까지 올라가지 않는다. 그래서 구간마다 captureException 을 뿌리는 대신
 *    이 한 자리에서 보고한다 — 중복도 누락도 없다.
 *
 * **응답에 서버 사정을 싣지 않는다.** 5xx 는 메시지를 고정 문구로 덮는다(어느 쿼리가 어떤
 * 값으로 깨졌는지는 우리만 알면 된다). 원문·스택·debug 값은 `debug` 를 켠 환경에서만 나간다.
 *
 * 응답 형식은 요청이 **HTML 페이지를 원하는지**(브라우저 주소창 이동)로 갈린다.
 * 브라우저 네비게이션(소셜 로그인 콜백 등)은 JSON 이 주소창에 노출되지 않게 HTML 페이지를 그린다.
 */
@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpError');

  /**
   * @param options.debug 켜면 오류 응답에 `debug` 객체(원문 메시지·스택·추적 값)를 싣는다.
   *   **운영에서는 켜지 않는다** — 서버 내부가 그대로 나간다.
   */
  constructor(private readonly options: { debug?: boolean } = {}) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const failure = describe(exception);

    this.report(failure, exception, req);

    if (wantsHtml(req)) {
      res.status(failure.status).type('html').send(renderErrorPage(failure.status, failure.code));
      return;
    }

    res.status(failure.status).json(this.jsonBody(failure, exception));
  }

  /**
   * 로그 한 줄 + (서버 잘못이면) Sentry 보고. 오류당 한 번만 지난다.
   *
   * **수준을 계열로 가른다.** 400·401·429 는 규약대로 도는 중에 늘 나는 것이라
   * warn 으로 쌓으면 진짜 봐야 할 것이 묻힌다 — 그래서 debug 로 내린다.
   *
   * 여기 남는 것은 어느 요청이 무슨 코드로 끝났나까지다. **왜 그랬는지는 던진 자리가 남긴다** —
   * 거기가 아는 값(어느 분기, 남의 결과코드)을 여기까지 옮겨 오지 않는다. 요청 id 로 이어 본다.
   */
  private report(failure: Failure, exception: unknown, req: Request): void {
    const requestId = (req as RequestWithId).requestId ?? '-';
    const where = `${req.method} ${req.originalUrl}`;
    const detail = failure.debug ? ` ${JSON.stringify(failure.debug)}` : '';
    const line = `${where} → ${failure.status} ${failure.code} [${requestId}] ${failure.logMessage}${detail}`;

    if (failure.serverFault) {
      // 서버가 깨진 것만 stack 을 남긴다. 400·404 의 stack 은 읽을 것이 없고 로그만 채운다.
      this.logger.error(line, exception instanceof Error ? exception.stack : String(exception));
      Sentry.captureException(exception);
      return;
    }

    this.logger.debug(line);
  }

  /**
   * 응답 바디.
   *
   * **상태 코드는 바디에 안 싣는다.** 그건 이미 HTTP 응답 라인에 있고, 두 군데 있으면
   * 어긋날 자리만 생긴다(응답 라인은 200 인데 바디는 500 인 API 를 다들 한 번쯤 겪는다).
   * 바디가 말하는 것은 상태가 못 말하는 것 — **무슨 일이었나(errorCode)와 사람이 읽을 한 줄**뿐이다.
   *
   * **debug 를 켜도 아무 오류에나 debug 를 붙이지 않는다.** 붙이는 자리는 부르는 쪽이 원인을
   * 짐작조차 못 하는 때다. 서버가 깨졌거나 바깥이 죽었으면 요청만 봐서는 알 길이 없으니
   * 원문·스택까지 실어 준다. 반대로 400·429 는 코드와 문장이 이미 다 말했고, 거기 우리 내부
   * 값을 붙이면 도움이 아니라 소음이다.
   *
   * 그 자리에서도 정말 보여줄 것이 있으면 던지는 쪽이 `debug` 에 담는다(보통은 비어 있다).
   */
  private jsonBody(failure: Failure, exception: unknown): Record<string, unknown> {
    const body: Record<string, unknown> = {
      errorCode: failure.code,
      message: failure.clientMessage,
    };

    if (!this.options.debug) return body;

    const debug = failure.serverFault
      ? {
          // 응답의 message 는 고정 문구로 덮였을 수 있다. 여기 원문을 함께 준다.
          message: failure.logMessage,
          ...failure.debug,
          stack: exception instanceof Error ? exception.stack?.split('\n') : undefined,
          cause: exception instanceof Error ? describeCause(exception.cause) : undefined,
        }
      : failure.debug;

    if (debug && Object.keys(debug).length > 0) {
      body.debug = debug;
    }

    return body;
  }
}

/** 오류를 응답·로그에 필요한 형태로 정리한 결과. */
interface Failure {
  status: number;
  code: AppErrorCode;
  /** 클라이언트가 받는 메시지. 5xx 는 고정 문구로 덮인다. */
  clientMessage: string | string[];
  /** 우리가 로그에서 읽는 메시지. 덮지 않은 원문이다. */
  logMessage: string;
  serverFault: boolean;
  /** 응답에 실어도 되는 값. 서버 잘못이 아니면 이것만 나간다. */
  debug?: Record<string, unknown>;
}

/** 서버 잘못일 때 밖으로 내보내는 고정 문구. 사정은 로그에만 남는다. */
const SERVER_FAULT_MESSAGE = 'The request could not be processed.';

/** 계열 → HTTP 상태. 이 표가 응용 계층과 HTTP 사이의 유일한 번역이다. */
const STATUS_BY_KIND: Record<AppErrorKind, number> = {
  bad_request: HttpStatus.BAD_REQUEST,
  unauthorized: HttpStatus.UNAUTHORIZED,
  forbidden: HttpStatus.FORBIDDEN,
  not_found: HttpStatus.NOT_FOUND,
  conflict: HttpStatus.CONFLICT,
  rate_limited: HttpStatus.TOO_MANY_REQUESTS,
  unavailable: HttpStatus.SERVICE_UNAVAILABLE,
  upstream_timeout: HttpStatus.GATEWAY_TIMEOUT,
  internal: HttpStatus.INTERNAL_SERVER_ERROR,
  not_implemented: HttpStatus.NOT_IMPLEMENTED,
};

/**
 * 상태 코드만 아는 예외(Nest 내부·가드·ValidationPipe)의 기본 오류 코드.
 *
 * 응용 계층이 AppError 로 올린 것은 자기 코드를 갖고 있으므로 여기까지 오지 않는다.
 * 여기 걸리는 것은 우리가 아직 코드를 안 붙였거나 프레임워크가 던진 것이다.
 */
const FALLBACK_CODE_BY_STATUS: Readonly<Record<number, AppErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: CommonErrorCode.BAD_REQUEST,
  [HttpStatus.UNAUTHORIZED]: CommonErrorCode.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: CommonErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: CommonErrorCode.NOT_FOUND,
  [HttpStatus.CONFLICT]: CommonErrorCode.CONFLICT,
  [HttpStatus.TOO_MANY_REQUESTS]: CommonErrorCode.RATE_LIMITED,
  [HttpStatus.NOT_IMPLEMENTED]: CommonErrorCode.NOT_IMPLEMENTED,
  [HttpStatus.SERVICE_UNAVAILABLE]: CommonErrorCode.SERVICE_UNAVAILABLE,
  [HttpStatus.GATEWAY_TIMEOUT]: CommonErrorCode.UPSTREAM_TIMEOUT,
};

/** 예외를 상태·코드·메시지로 푼다. 응답과 로그가 같은 판단을 쓰게 한 자리에 모은다. */
function describe(exception: unknown): Failure {
  if (exception instanceof AppError) {
    const status = STATUS_BY_KIND[exception.kind] ?? HttpStatus.INTERNAL_SERVER_ERROR;
    return {
      status,
      code: exception.code,
      clientMessage: exception.hidesMessage ? SERVER_FAULT_MESSAGE : exception.message,
      logMessage: exception.message,
      serverFault: exception.isServerFault,
      debug: exception.debug,
    };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const message = extractHttpMessage(exception);
    // 배열 메시지는 ValidationPipe 가 필드별 위반을 모아 준 것이다. 그 모양 그대로 내보낸다 —
    // 프론트가 필드별로 붙여 쓰고 있고, 한 줄로 합치면 어느 필드인지 잃는다.
    const validation = Array.isArray(message);
    const serverFault = status >= 500;
    // 500 만 문구를 덮는다. 502·503·504 는 "지금은 안 된다" 를 알리려고 쓴 말이라
    // 부르는 쪽이 물러설 근거가 되고, 서버 사정이 드러나는 문장도 아니다.
    const hides = status === Number(HttpStatus.INTERNAL_SERVER_ERROR);
    return {
      status,
      code: validation
        ? CommonErrorCode.VALIDATION_FAILED
        : (FALLBACK_CODE_BY_STATUS[status] ??
          (serverFault ? CommonErrorCode.INTERNAL_ERROR : CommonErrorCode.BAD_REQUEST)),
      clientMessage: hides ? SERVER_FAULT_MESSAGE : message,
      logMessage: Array.isArray(message) ? message.join(' ') : message,
      serverFault,
    };
  }

  // 우리가 예상하지 못한 것. 여기 오는 것은 전부 버그로 본다.
  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    code: CommonErrorCode.INTERNAL_ERROR,
    clientMessage: SERVER_FAULT_MESSAGE,
    logMessage: exception instanceof Error ? exception.message : String(exception),
    serverFault: true,
  };
}

/** HttpException 응답에서 메시지를 뽑는다(ValidationPipe 의 배열 형태를 살린다). */
function extractHttpMessage(exception: HttpException): string | string[] {
  const resp = exception.getResponse();
  if (typeof resp === 'string') return resp;
  if (resp && typeof resp === 'object' && 'message' in resp) {
    const m: unknown = resp.message;
    if (Array.isArray(m)) return m.map(String);
    if (typeof m === 'string') return m;
  }
  return exception.message;
}

/**
 * cause 를 로그·debug 에 실을 수 있는 문자열로 만든다.
 *
 * **객체를 그대로 JSON 에 넣지 않는다.** 순환 참조면 직렬화가 통째로 터지고,
 * 안 터져도 남의 라이브러리 객체가 통째로 실려 나간다(무엇이 담겨 있는지 우리가 모른다).
 */
function describeCause(cause: unknown): string | undefined {
  if (cause === undefined || cause === null) return undefined;
  if (cause instanceof Error) return `${cause.name}: ${cause.message}`;
  if (typeof cause === 'string') return cause;
  if (typeof cause === 'number' || typeof cause === 'boolean' || typeof cause === 'bigint') {
    return cause.toString();
  }
  // 객체·함수·심볼. 무엇이 담겼는지 모르는 값이라 종류만 남긴다.
  return Object.prototype.toString.call(cause);
}

/** 브라우저 페이지 이동 요청인지(HTML 응답을 기대하는지) 헤더로 판별한다. */
function wantsHtml(req: Request): boolean {
  const accept = String(req.headers['accept'] ?? '');
  const dest = String(req.headers['sec-fetch-dest'] ?? '');
  const xhr = String(req.headers['x-requested-with'] ?? '').toLowerCase() === 'xmlhttprequest';
  if (xhr) return false;
  return dest === 'document' || accept.includes('text/html');
}

/** HTML 특수문자 이스케이프(반사형 XSS 방지). */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 자체 완결형 에러 페이지(인라인 CSS, 외부 의존 없음).
 *
 * **예외 메시지를 그대로 쓰지 않는다.** 이 페이지는 주소창을 타고 들어온 사람이 보는 화면이라
 * 영어 원문(개발자용)을 붙일 자리가 아니고, 서버 사정이 그대로 보이는 것도 곤란하다.
 * 사람에게는 한국어 안내를, 문의에 필요한 오류 코드는 작게 곁들인다.
 */
function renderErrorPage(status: number, code: AppErrorCode): string {
  const safeCode = escapeHtml(String(code));
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>오류 ${status} · plzhans</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    padding: 24px; background: #f5f6f8; color: #1f2430;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
  }
  .card {
    width: 100%; max-width: 420px; background: #fff; border: 1px solid #e6e8ec;
    border-radius: 16px; padding: 40px 32px; text-align: center;
    box-shadow: 0 8px 30px rgba(0,0,0,0.06);
  }
  .badge {
    display: inline-flex; align-items: center; justify-content: center;
    width: 56px; height: 56px; border-radius: 50%;
    background: #fdecec; color: #d64545; font-size: 30px; font-weight: 700; margin-bottom: 20px;
  }
  .status { font-size: 13px; font-weight: 600; letter-spacing: .04em; color: #9aa0aa; margin-bottom: 8px; }
  h1 { font-size: 18px; margin: 0 0 12px; }
  p { font-size: 14px; line-height: 1.6; color: #5a616e; margin: 0 0 24px; word-break: keep-all; }
  code { font-size: 12px; color: #9aa0aa; letter-spacing: .02em; }
  a.btn {
    display: inline-block; padding: 10px 20px; border-radius: 10px;
    background: #2f6bff; color: #fff; text-decoration: none; font-size: 14px; font-weight: 600;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #14161a; color: #e7e9ee; }
    .card { background: #1c1f26; border-color: #2a2e37; box-shadow: none; }
    .badge { background: #3a2323; color: #ff7a7a; }
    p { color: #9aa0aa; }
  }
</style>
</head>
<body>
  <div class="card">
    <div class="badge">!</div>
    <div class="status">오류 ${status}</div>
    <h1>요청을 처리하지 못했습니다</h1>
    <p>잠시 후 다시 시도해 주세요. 문제가 계속되면 아래 코드를 알려 주세요.</p>
    <p><code>${safeCode}</code></p>
    <a class="btn" href="javascript:history.back()">돌아가기</a>
  </div>
</body>
</html>`;
}
