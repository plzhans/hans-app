import type { Request } from 'express';

/** 헤더 값(문자열 | 배열 | 콤마목록)에서 첫 값을 뽑는다. */
function first(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined;
  const s = Array.isArray(value) ? value[0] : value;
  return s.split(',')[0]?.trim() || undefined;
}

/**
 * 요청이 실제로 들어온 외부 오리진을 만든다: `{scheme}://{host}`.
 * 리버스 프록시(TLS 종단) 뒤에서는 X-Forwarded-Proto/Host 를 우선한다.
 * redirect_uri 를 별도 env 없이 요청 도메인 그대로 구성하는 데 쓴다.
 */
export function externalBaseUrl(req: Request): string {
  const proto = first(req.headers['x-forwarded-proto']) ?? req.protocol ?? 'https';
  const host = first(req.headers['x-forwarded-host']) ?? req.get('host') ?? '';
  return `${proto}://${host}`;
}
