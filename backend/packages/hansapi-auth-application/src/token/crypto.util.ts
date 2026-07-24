import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * 인증 토큰(refresh·인가코드)의 공통 암호 유틸.
 *
 * 서버는 토큰 원문을 저장하지 않는다. 랜덤 secret 의 SHA-256 해시만 DB 에 두고,
 * 검증 시 상수시간 비교한다. 토큰 문자열은 `<id>.<secret>` 형태로 조립/분해한다.
 */

/** URL-safe 랜덤 문자열(base64url). bytes=24 → 32자. */
export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString('base64url');
}

/** SHA-256 hex(64자). secret 저장·비교용. */
export function sha256hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * SHA-256 을 base64url 로. **PKCE(RFC 7636) 의 S256 변환**이 이 형식을 요구한다.
 * hex 가 아닌 이유는 스펙이 그렇게 정했기 때문이다 — 클라이언트가 만드는 challenge 와
 * 글자 단위로 같아야 대조가 된다.
 */
export function sha256base64url(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

/** hex 문자열 두 개를 상수시간 비교한다. 길이가 다르면 false. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** `<id>.<secret>` 로 조립한다. */
export function composeToken(id: string, secret: string): string {
  return `${id}.${secret}`;
}

/**
 * `<prefix><id>.<secret>` 을 분해한다. 형식이 어긋나면 null.
 * prefix 예: 'rt_'(refresh), 'ac_'(인가코드).
 */
export function parseToken(
  raw: string,
  prefix: string,
): { id: string; secret: string } | null {
  if (!raw.startsWith(prefix)) {
    return null;
  }
  const body = raw.slice(prefix.length);
  const dot = body.indexOf('.');
  if (dot <= 0 || dot === body.length - 1) {
    return null;
  }
  return { id: body.slice(0, dot), secret: body.slice(dot + 1) };
}
