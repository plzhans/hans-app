import { randomUUID } from 'node:crypto';
import type { NextFunction, Request } from 'express';

/** 헤더 이름. 사실상 업계 표준이라 프록시·APM 이 이미 아는 이름이다. */
export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * 받아들일 모양. **클라이언트가 주는 값이라 믿지 않는다.**
 *
 * 길이를 안 자르면 로그 한 줄이 수십 KB 가 되고, 문자를 안 거르면 줄바꿈을 섞어
 * 로그를 위조할 수 있다(그 줄 뒤에 가짜 로그를 붙이는 식). 영숫자·`-`·`_` 로 좁힌다.
 */
const VALID_ID = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * 요청 하나에 추적용 id 를 붙인다.
 *
 * **클라이언트가 준 값을 쓰되, 모양이 맞을 때만이다.** 브라우저가 만든 id 를 그대로
 * 이어 쓰면 프론트 콘솔과 서버 로그가 같은 값으로 묶여 "이 화면의 이 요청" 을 바로 찾는다.
 * 모양이 틀리면 조용히 새로 만든다 — 잘못된 헤더 하나로 요청을 거절할 이유는 없다.
 *
 * **응답에는 안 싣는다.** 내부 추적용이라 밖으로 나갈 이유가 없다 — 로그·APM 에서
 * 요청 하나를 이어 보는 데만 쓴다. 사용자에게 보여줄 일이 생기면 그때 노출한다.
 *
 * 값이 겹칠 수 있다는 점은 그대로 둔다 — 클라이언트가 같은 id 를 두 번 보내면 로그가
 * 겹치지만, 그건 그쪽 버그이지 우리가 막을 일이 아니다(서버가 만든 값은 UUID 라 안 겹친다).
 */
export function requestIdMiddleware(req: Request, _res: unknown, next: NextFunction): void {
  const given = req.headers[REQUEST_ID_HEADER];
  const candidate = Array.isArray(given) ? given[0] : given;

  const id = candidate && VALID_ID.test(candidate) ? candidate : randomUUID();

  // 아래 계층이 req 에서 꺼내 쓴다. 헤더를 다시 파싱하지 않게 정규화된 값을 얹어 둔다.
  (req as RequestWithId).requestId = id;
  next();
}

/** `req.requestId` 를 읽는 쪽이 쓸 타입. 미들웨어가 항상 채운다. */
export interface RequestWithId extends Request {
  requestId?: string;
}
