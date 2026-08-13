import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { resolveLang, type SupportedLang } from '@hansapp/common';
import type { Request } from 'express';

/**
 * 응답 언어. Accept-Language 헤더에서 뽑는다.
 *
 * **쿼리 파라미터(`?lang=en`)로 받지 않는다.** 언어는 요청의 성격이지 조회 조건이 아니다 —
 * 쿼리로 두면 캐시 키·URL·문서가 전부 언어를 알아야 하고, 안 붙이면 조용히 한국어가 나온다.
 * 헤더는 브라우저가 알아서 보내고, 우리 프론트도 이미 보내고 있다.
 *
 * @example
 *   async list(@Lang() lang: SupportedLang) { ... }
 */
export const Lang = createParamDecorator((_data: unknown, ctx: ExecutionContext): SupportedLang => {
  const request = ctx.switchToHttp().getRequest<Request>();
  return resolveLang(request.headers['accept-language']);
});
