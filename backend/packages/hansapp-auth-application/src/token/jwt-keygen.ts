import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
} from 'node:crypto';

/**
 * access token 서명 키의 생성·식별 공용 유틸.
 * JwtKeyService(런타임 로드)와 CLI(키 생성)가 **같은 방식으로 kid 를 계산**하도록 여기 모은다
 * — 파일명(kid)과 부팅 때 계산한 kid 가 반드시 일치해야 하기 때문이다.
 */

/** access token 서명 알고리즘(RFC 7518, EC 계열). */
export type AccessAlg = 'ES256' | 'ES384' | 'ES512';

/** kid = JWK thumbprint(RFC 7638) 의 앞 KID_LEN 자. 파일명·JWT 헤더·JWKS 공용 식별자. */
export const KID_LEN = 16;

const CURVE: Record<AccessAlg, string> = {
  ES256: 'prime256v1',
  ES384: 'secp384r1',
  ES512: 'secp521r1',
};

/** 공개 JWK 로부터 RFC 7638 thumbprint 의 앞 KID_LEN 자를 계산한다. */
export function jwkThumbprint(jwk: Record<string, string>): string {
  const canonical =
    jwk.kty === 'EC'
      ? JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y })
      : JSON.stringify({ e: jwk.e, kty: jwk.kty, n: jwk.n });
  return createHash('sha256')
    .update(canonical)
    .digest('base64url')
    .slice(0, KID_LEN);
}

/** PEM(개인 또는 공개)에서 **공개** JWK 를 뽑는다. 개인키면 d(개인 스칼라)를 제거한다. */
export function publicJwkFromPem(
  pem: string,
  isPrivate: boolean,
): Record<string, string> {
  if (isPrivate) {
    const jwk = createPrivateKey(pem).export({ format: 'jwk' }) as Record<
      string,
      string
    >;
    delete jwk.d;
    return jwk;
  }
  return createPublicKey(pem).export({ format: 'jwk' }) as Record<
    string,
    string
  >;
}

/**
 * PEM(개인/공개)에서 공개 **SPKI PEM** 을 만든다(검증·retired 공개키 저장용).
 * createPublicKey 의 JWK 입력 타입은 @types/node 버전마다 이름이 달라 버전 무관하게 캐스팅한다.
 */
export function publicPemFromPem(pem: string, isPrivate: boolean): string {
  const jwk = publicJwkFromPem(pem, isPrivate);
  return createPublicKey({
    key: jwk,
    format: 'jwk',
  } as unknown as Parameters<typeof createPublicKey>[0]).export({
    type: 'spki',
    format: 'pem',
  }) as string;
}

/** EC 곡선 → JWT alg. 알 수 없으면 null. */
export function algForCurve(crv?: string): AccessAlg | null {
  if (crv === 'P-256') return 'ES256';
  if (crv === 'P-384') return 'ES384';
  if (crv === 'P-521') return 'ES512';
  return null;
}

export interface GeneratedKey {
  readonly kid: string;
  readonly alg: AccessAlg;
  readonly privatePem: string;
  readonly publicPem: string;
}

/** ES 계열 키페어를 생성하고 kid(thumbprint)를 계산한다. */
export function generateAccessKeyPair(alg: AccessAlg = 'ES256'): GeneratedKey {
  const { publicKey, privateKey } = generateKeyPairSync('ec', {
    namedCurve: CURVE[alg],
  });
  const jwk = publicKey.export({ format: 'jwk' }) as Record<string, string>;
  return {
    kid: jwkThumbprint(jwk),
    alg,
    privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    publicPem: publicKey.export({ type: 'spki', format: 'pem' }) as string,
  };
}
