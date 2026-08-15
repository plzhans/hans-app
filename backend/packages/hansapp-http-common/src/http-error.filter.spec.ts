import { BadRequestException, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import {
  BadRequestError,
  CommonErrorCode,
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  NotImplementedError,
  TooManyRequestsError,
  UnauthorizedError,
  UnavailableError,
  UpstreamTimeoutError,
  message,
  registerErrorCodes,
} from '@hansapp/common';

import { HttpErrorFilter } from './http-error.filter';

/*
  **오류가 밖으로 나가는 유일한 문을 검사한다.** 이 필터가 틀리면 컴파일도 되고 앱도 뜬다 —
  드러나는 것은 운영에서 그 오류가 실제로 날 때다. 특히 조용히 틀리는 것들:

    · internal 인데 메시지가 안 덮여 서버 사정이 응답으로 나간다
    · debug 를 껐는데 스택이 샌다
    · 429 로 나가야 할 것이 400 으로 나가 클라이언트가 물러설 줄 모른다
*/

/** 이 테스트만 쓰는 번호. 다른 표와 겹치지 않게 90000대를 쓴다. */
class TestErrorCode {
  @message('Widget not found.')
  static readonly WIDGET_NOT_FOUND = 90000;
  /** 문구를 일부러 안 단다 — 이름이 대신 나가는지 본다. */
  static readonly WIDGET_NO_MESSAGE = 90001;
}
registerErrorCodes('TestErrorCode', TestErrorCode);

/** 필터가 쓰는 것만 담은 가짜 요청. */
function request(overrides: Partial<{ accept: string; requestId: string }> = {}) {
  return {
    method: 'GET',
    originalUrl: '/widgets/1',
    headers: overrides.accept ? { accept: overrides.accept } : {},
    requestId: overrides.requestId ?? 'req-1',
  };
}

interface Captured {
  status: number;
  json?: Record<string, unknown>;
  html?: string;
}

/** 필터를 돌리고 응답으로 나간 것을 받아 온다. */
function run(exception: unknown, options: { debug?: boolean; accept?: string } = {}): Captured {
  const captured: Captured = { status: 0 };
  const res = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(body: Record<string, unknown>) {
      captured.json = body;
    },
    type() {
      return this;
    },
    send(html: string) {
      captured.html = html;
    },
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => res,
      getRequest: () => request({ accept: options.accept }),
    }),
  } as unknown as ArgumentsHost;

  new HttpErrorFilter({ debug: options.debug }).catch(exception, host);
  return captured;
}

describe('HttpErrorFilter', () => {
  // 로그·Sentry 는 여기서 검사하지 않는다. Nest 로거는 stdout 에 직접 쓰므로
  // console 을 가려도 소용없다 — 로거 자체를 끈다.
  beforeAll(() => {
    Logger.overrideLogger(false);
  });

  describe('계열 → HTTP 상태', () => {
    /*
      **상태는 던진 오류의 기준 클래스가 정한다.** 이 표가 어긋나면 클라이언트가 물러설지
      다시 로그인할지를 잘못 판단한다 — 특히 429 가 400 으로 나가면 백오프가 안 걸린다.
    */
    it.each([
      [new BadRequestError(), HttpStatus.BAD_REQUEST],
      [new ConflictError(), HttpStatus.CONFLICT],
      [new TooManyRequestsError(), HttpStatus.TOO_MANY_REQUESTS],
      [new UnauthorizedError(), HttpStatus.UNAUTHORIZED],
      [new ForbiddenError(), HttpStatus.FORBIDDEN],
      [new NotFoundError(), HttpStatus.NOT_FOUND],
      [new UnavailableError(), HttpStatus.SERVICE_UNAVAILABLE],
      [new UpstreamTimeoutError(), HttpStatus.GATEWAY_TIMEOUT],
      [new InternalError(), HttpStatus.INTERNAL_SERVER_ERROR],
      [new NotImplementedError(), HttpStatus.NOT_IMPLEMENTED],
    ])('%s → %i', (error, status) => {
      expect(run(error).status).toBe(status);
    });

    it('TooManyRequestsError 는 BadRequestError 의 자식이지만 429 로 나간다', () => {
      const error = new TooManyRequestsError();
      expect(error).toBeInstanceOf(BadRequestError);
      expect(run(error).status).toBe(HttpStatus.TOO_MANY_REQUESTS);
    });
  });

  describe('응답 바디', () => {
    it('번호와 문구만 담는다 — 상태 코드는 응답 라인에 있으므로 싣지 않는다', () => {
      const body = run(new NotFoundError(TestErrorCode.WIDGET_NOT_FOUND)).json;
      expect(body).toEqual({ errorCode: 90000, message: 'Widget not found.' });
      expect(body).not.toHaveProperty('statusCode');
    });

    it('문구를 생략하면 번호의 기본 문구가 나간다', () => {
      expect(run(new NotFoundError(TestErrorCode.WIDGET_NOT_FOUND)).json?.message).toBe(
        'Widget not found.',
      );
    });

    it('문구를 안 단 번호는 이름이 대신 나간다', () => {
      expect(run(new NotFoundError(TestErrorCode.WIDGET_NO_MESSAGE)).json?.message).toBe(
        'WIDGET_NO_MESSAGE',
      );
    });

    it('그 자리에서만 다른 문구를 주면 그것이 나간다', () => {
      const error = new NotFoundError(TestErrorCode.WIDGET_NOT_FOUND, {
        message: 'Widget 42 is gone.',
      });
      expect(run(error).json?.message).toBe('Widget 42 is gone.');
    });
  });

  describe('서버 사정을 숨긴다', () => {
    /*
      internal 의 메시지는 우리가 읽으려고 쓴 것이라(어느 쿼리가 어떤 값으로 깨졌는지)
      그대로 나가면 서버 내부가 드러난다.
    */
    it('internal 은 메시지를 고정 문구로 덮는다', () => {
      const error = new InternalError({ message: 'SELECT ... WHERE tenant_id = 42 failed' });
      const body = run(error).json;
      expect(body?.message).toBe('The request could not be processed.');
      expect(JSON.stringify(body)).not.toContain('tenant_id');
    });

    it('unavailable 은 메시지를 그대로 내보낸다 — 언제 다시 되는지는 알려야 한다', () => {
      const error = new UnavailableError(CommonErrorCode.SERVICE_UNAVAILABLE, {
        message: 'AI search is unavailable for today',
      });
      expect(run(error).json?.message).toBe('AI search is unavailable for today');
    });

    it('AppError 가 아닌 것은 500 INTERNAL_ERROR 로 떨어지고 원문이 안 나간다', () => {
      const captured = run(new Error('connect ECONNREFUSED 10.0.0.5:3306'));
      expect(captured.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(captured.json).toEqual({
        errorCode: CommonErrorCode.INTERNAL_ERROR,
        message: 'The request could not be processed.',
      });
    });
  });

  describe('debug 필드', () => {
    it('플래그를 끄면 붙지 않는다', () => {
      const error = new InternalError({ message: 'boom' });
      expect(run(error, { debug: false }).json).not.toHaveProperty('debug');
    });

    it('플래그를 켜도 클라이언트 잘못에는 안 붙는다 — 번호와 문구가 이미 다 말했다', () => {
      const error = new BadRequestError(TestErrorCode.WIDGET_NOT_FOUND);
      expect(run(error, { debug: true }).json).not.toHaveProperty('debug');
    });

    it('플래그를 켜면 서버가 깨진 응답에만 원문·스택이 실린다', () => {
      const error = new InternalError({ message: 'prompt file missing: svc-hospital.md' });
      const debug = run(error, { debug: true }).json?.debug as Record<string, unknown>;
      expect(debug.message).toBe('prompt file missing: svc-hospital.md');
      expect(Array.isArray(debug.stack)).toBe(true);
    });

    it('던지는 쪽이 debug 를 담으면 클라이언트 잘못에도 실린다', () => {
      const error = new BadRequestError(TestErrorCode.WIDGET_NOT_FOUND, {
        debug: { allowed: ['a', 'b'] },
      });
      expect(run(error, { debug: true }).json?.debug).toEqual({ allowed: ['a', 'b'] });
    });
  });

  describe('AppError 가 아닌 예외', () => {
    it('ValidationPipe 의 필드별 배열은 모양을 지키고 VALIDATION_FAILED 가 된다', () => {
      const exception = new BadRequestException([
        'email must be an email',
        'name should not be empty',
      ]);
      const body = run(exception).json;
      expect(body?.errorCode).toBe(CommonErrorCode.VALIDATION_FAILED);
      expect(body?.message).toEqual(['email must be an email', 'name should not be empty']);
    });

    it('상태 코드만 아는 예외는 그 상태의 기본 번호를 받는다', () => {
      const captured = run(new HttpException('nope', HttpStatus.FORBIDDEN));
      expect(captured.status).toBe(HttpStatus.FORBIDDEN);
      expect(captured.json?.errorCode).toBe(CommonErrorCode.FORBIDDEN);
    });
  });

  describe('브라우저 주소창 이동', () => {
    /*
      소셜 로그인 콜백처럼 사람이 주소창을 타고 들어온 자리다. JSON 이 그대로 보이면 안 되고,
      개발자용 영어 원문을 붙일 자리도 아니다 — 한국어 안내와 문의용 번호만 보여준다.
    */
    it('Accept: text/html 이면 HTML 을 그린다', () => {
      const captured = run(new NotFoundError(TestErrorCode.WIDGET_NOT_FOUND), {
        accept: 'text/html',
      });
      expect(captured.status).toBe(HttpStatus.NOT_FOUND);
      expect(captured.json).toBeUndefined();
      expect(captured.html).toContain('90000');
      expect(captured.html).not.toContain('Widget not found.');
    });
  });
});
