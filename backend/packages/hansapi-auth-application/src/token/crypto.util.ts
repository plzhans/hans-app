import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';

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
 * HMAC-SHA256 hex(64자). **저장 전 pepper(서버 시크릿)를 섞는다.**
 * 이메일·OTP 코드처럼 엔트로피가 낮은 값은 평범한 SHA-256 만으로는 사전 대입으로 복원되므로,
 * DB 가 유출돼도 시크릿 없이는 되돌릴 수 없게 keyed hash 를 쓴다.
 */
export function hmacSha256hex(value: string, key: string): string {
  return createHmac('sha256', key).update(value).digest('hex');
}

/** 앞자리 0 을 포함하는 length 자리 숫자 코드. 암호학적 난수(randomInt) 사용. */
export function randomNumericCode(length: number): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += randomInt(0, 10).toString();
  }
  return code;
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

/** HMAC 태그 길이(hex). 96비트 — DB 조회 전 정크 거절용 사전 필터라 이 정도면 충분하다. */
const SIGNED_TAG_HEX_LEN = 24;

/**
 * HMAC 태그를 붙여 조립한다: `<id>.<secret>.<tag>`.
 * tag = HMAC-SHA256(key, `<id>.<secret>`) 의 앞 24자.
 *
 * **DB 조회 전에 위조·변조·정크 토큰을 인메모리(상수시간)로 걸러내기 위한 사전 관문이다.**
 * 보안 경계는 여전히 DB 의 secretHash — 태그는 값싼 필터라 잘라 써도 된다.
 */
export function composeSignedToken(
  id: string,
  secret: string,
  key: string,
): string {
  const body = `${id}.${secret}`;
  const tag = hmacSha256hex(body, key).slice(0, SIGNED_TAG_HEX_LEN);
  return `${body}.${tag}`;
}

/**
 * `<prefix><id>.<secret>.<tag>` 를 분해하고 HMAC 태그를 상수시간 검증한다.
 * 형식 오류·태그 불일치는 null → 호출측이 **DB 조회 없이** 거절한다.
 * id·secret 은 base64url 이라 '.' 을 포함하지 않으므로 3분할이 안전하다.
 */
export function parseSignedToken(
  raw: string,
  prefix: string,
  key: string,
): { id: string; secret: string } | null {
  if (!raw.startsWith(prefix)) {
    return null;
  }
  const parts = raw.slice(prefix.length).split('.');
  if (parts.length !== 3) {
    return null;
  }
  const [id, secret, tag] = parts;
  if (!id || !secret || !tag) {
    return null;
  }
  const expected = hmacSha256hex(`${id}.${secret}`, key).slice(
    0,
    SIGNED_TAG_HEX_LEN,
  );
  if (!timingSafeEqualHex(expected, tag)) {
    return null;
  }
  return { id, secret };
}
