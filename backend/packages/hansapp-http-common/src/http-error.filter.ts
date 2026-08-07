import {
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
// catch() 가 데코레이터를 달면서 emitDecoratorMetadata 대상이 됐다. 시그니처에 쓰는 타입은
// `import type` 이어야 한다(isolatedModules + emitDecoratorMetadata 조합의 요구, TS1272).
import type { ArgumentsHost } from '@nestjs/common';
import type { Request, Response } from 'express';
import * as Sentry from '@sentry/nestjs';
import { SentryExceptionCaptured } from '@sentry/nestjs';

/**
 * 전역 예외 필터. 요청이 **HTML 페이지를 원하는지**(브라우저 주소창 이동)로 응답 형식을 정한다.
 *
 * - 브라우저 네비게이션(소셜 로그인 시작/콜백 등): `Accept: text/html` 또는 `Sec-Fetch-Dest: document`
 *   → 사람이 읽는 HTML 에러 페이지를 그린다(JSON 이 주소창에 노출되지 않게).
 * - SPA fetch/XHR(Accept 가 text/html 이 아님): 기존과 동일한 JSON 에러 응답을 그대로 유지한다.
 *
 * JSON 분기는 Nest 기본 필터의 응답 형태(HttpException 은 getResponse() 원형, 그 외 500)를
 * 그대로 재현해 API 계약을 깨지 않는다.
 *
 * **Sentry 보고도 여기서 한다.** 전역 필터가 예외를 잡아 응답으로 바꿔 버리면 Sentry 의 기본
 * 미처리 예외 훅까지 올라가지 않아 아무것도 보고되지 않는다.
 */
@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpError');

  // 여기 올라온 예외를 Sentry 로 보낸다. 단, HttpException 은 "의도해서 던진 것" 으로 보고
  // 데코레이터가 건너뛴다(400·401·404 로 이슈가 도배되지 않게). 5xx HttpException 만
  // 아래에서 직접 보고한다 — 데코레이터가 거른 것만 채우므로 중복 전송되지 않는다.
  @SentryExceptionCaptured()
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= 500) {
      this.logger.error(
        `${req.method} ${req.originalUrl} → ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
      // 5xx 로 떨어진 HttpException(InternalServerErrorException 등)은 데코레이터가 "예상된 예외" 로
      // 걸러 버린다. 하지만 5xx 는 실제로 서버가 깨진 것이라 봐야 한다 — 그 구멍만 메운다.
      if (exception instanceof HttpException) {
        Sentry.captureException(exception);
      }
    }

    if (wantsHtml(req)) {
      const message = extractMessage(exception, status);
      res.status(status).type('html').send(renderErrorPage(status, message));
      return;
    }

    res.status(status).json(jsonBody(exception, status));
  }
}

/** 브라우저 페이지 이동 요청인지(HTML 응답을 기대하는지) 헤더로 판별한다. */
function wantsHtml(req: Request): boolean {
  const accept = String(req.headers['accept'] ?? '');
  const dest = String(req.headers['sec-fetch-dest'] ?? '');
  const xhr =
    String(req.headers['x-requested-with'] ?? '').toLowerCase() ===
    'xmlhttprequest';
  if (xhr) return false;
  return dest === 'document' || accept.includes('text/html');
}

/** Nest 기본 필터와 동일한 JSON 응답 바디를 만든다. */
function jsonBody(exception: unknown, status: number): unknown {
  if (exception instanceof HttpException) {
    const resp = exception.getResponse();
    return typeof resp === 'string'
      ? { statusCode: status, message: resp }
      : resp;
  }
  return { statusCode: status, message: 'Internal server error' };
}

/** HttpException 응답에서 사람이 읽을 메시지를 뽑는다. */
function extractMessage(exception: unknown, status: number): string {
  if (exception instanceof HttpException) {
    const resp = exception.getResponse();
    if (typeof resp === 'string') return resp;
    if (resp && typeof resp === 'object' && 'message' in resp) {
      const m: unknown = resp.message;
      if (Array.isArray(m)) return m.join(' ');
      if (typeof m === 'string') return m;
    }
    return exception.message;
  }
  return status >= 500 ? '요청을 처리하지 못했습니다.' : '잘못된 요청입니다.';
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

/** 자체 완결형 에러 페이지(인라인 CSS, 외부 의존 없음). */
function renderErrorPage(status: number, message: string): string {
  const safeMessage = escapeHtml(message);
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
    <p>${safeMessage}</p>
    <a class="btn" href="javascript:history.back()">돌아가기</a>
  </div>
</body>
</html>`;
}
