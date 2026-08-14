/**
 * access token(JWT) 을 **브라우저에서 직접 검증한다.** 공개키는 JWKS 에서 가져온다.
 *
 * **왜 필요한가.** 토큰은 localStorage 에 있고, 앱은 부팅할 때마다 "이걸 로그인으로 볼지"를
 * 정해야 한다. 서버에 물어보면 확실하지만 응답이 올 때까지 헤더에 아무것도 못 그린다 —
 * 그 사이가 곧 로그인 버튼과 사용자 메뉴가 번갈아 깜빡이는 구간이다. 서명과 만료를
 * 로컬에서 확인하면 첫 페인트에 바로 결정할 수 있고, 서버 확인은 그 뒤에 붙인다.
 *
 * **이건 보안 경계가 아니다.** 진짜 검사는 서버가 한다(서명 + 세션 생존). 여기서 막는 것은
 * 손상되거나 만료된 값을 들고 로그인 상태라고 우기는 일이다.
 */

/** access token 에 실리는 클레임(발급 측 TokenService 와 맞춘다). */
export interface AccessClaims {
  /** 회원번호(문자열) */
  sub: string;
  /** 세션 식별자. 로그아웃할 때 이 세션만 폐기한다. */
  sid: number;
  role?: string;
  /** 만료(Unix 초) */
  exp?: number;
  iss?: string;
}

export type JwtStatus =
  /** 서명·만료 모두 통과 */
  | 'valid'
  /** 서명은 맞는데(또는 확인할 수 없는데) 만료됨 → refresh 로 살릴 수 있다 */
  | 'expired'
  /** 서명 불일치·형식 파손 → 버린다 */
  | 'invalid'
  /**
   * 공개키를 못 구해 서명을 확인하지 못했다. 만료만 통과한 상태다.
   *
   * 서버가 대칭(HS256) 폴백으로 뜬 환경이면 JWKS 가 비어 있어 늘 여기로 온다
   * (로컬 개발이 그렇다). 이때는 서버 응답이 최종 판단이다.
   */
  | 'unverified';

export interface JwtCheck {
  status: JwtStatus;
  /** 파싱된 클레임. status 가 'invalid' 면 없다. */
  claims?: AccessClaims;
}

/** 곡선 → 서명 해시. 서버는 ES256/384/512 만 발급한다(jwt-keygen.ts). */
const CURVE_HASH: Record<string, string> = {
  'P-256': 'SHA-256',
  'P-384': 'SHA-384',
  'P-521': 'SHA-512',
};

interface Jwks {
  keys: JsonWebKey[];
}

/** JWKS 캐시(엔드포인트별). 키는 거의 안 바뀌므로 한 번 읽어 들고 있는다. */
const jwksCache = new Map<string, { keys: JsonWebKey[]; fetchedAt: number }>();

/** 모르는 kid 를 만났을 때 다시 읽어보기까지의 최소 간격(ms). 키 교체 대비. */
const REFETCH_COOLDOWN_MS = 60_000;

/**
 * 토큰의 서명과 만료를 확인한다.
 *
 * 서명을 **먼저** 본다. 만료 시각도 클레임이라, 손댄 토큰이면 exp 부터 믿을 수 없다.
 */
export async function verifyAccessToken(token: string, jwksUri: string): Promise<JwtCheck> {
  const parts = token.split('.');
  if (parts.length !== 3) return { status: 'invalid' };

  const header = decodeSegment<{ kid?: string; alg?: string }>(parts[0]);
  const claims = decodeSegment<AccessClaims>(parts[1]);
  if (!header || !claims) return { status: 'invalid' };

  const signature = await checkSignature(token, header.kid, jwksUri);
  if (signature === 'invalid') return { status: 'invalid' };

  if (isExpired(claims)) return { status: 'expired', claims };
  return { status: signature === 'valid' ? 'valid' : 'unverified', claims };
}

/** 검증 없이 클레임만 읽는다. 만료된 토큰에서 세션 식별자를 꺼낼 때 쓴다. */
export function readClaims(token: string): AccessClaims | null {
  const segment = token.split('.')[1];
  return segment ? decodeSegment<AccessClaims>(segment) : null;
}

// ---- 내부 ----

function isExpired(claims: AccessClaims): boolean {
  // exp 가 없는 토큰은 만료를 판단할 근거가 없다 → 만료로 보지 않는다(서버가 정한다).
  if (typeof claims.exp !== 'number') return false;
  return claims.exp * 1000 <= Date.now();
}

async function checkSignature(
  token: string,
  kid: string | undefined,
  jwksUri: string,
): Promise<'valid' | 'invalid' | 'unverified'> {
  // crypto.subtle 은 보안 컨텍스트(https·localhost)에서만 있다. 없으면 서버에 맡긴다.
  if (typeof crypto === 'undefined' || !crypto.subtle) return 'unverified';

  const jwk = await findKey(jwksUri, kid);
  if (!jwk) return 'unverified';

  const hash = jwk.crv ? CURVE_HASH[jwk.crv] : undefined;
  // EC 가 아닌 키(장래의 RSA 등)는 여기서 다루지 않는다. 못 봤다고만 말한다.
  if (jwk.kty !== 'EC' || !hash) return 'unverified';

  const [headerSeg, payloadSeg, signatureSeg] = token.split('.');
  try {
    const key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'ECDSA', namedCurve: jwk.crv as string },
      false,
      ['verify'],
    );
    // JWS 의 ES 서명은 r‖s 원시 바이트라 WebCrypto 가 그대로 받는다(DER 변환 불필요).
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: { name: hash } },
      key,
      base64urlToBytes(signatureSeg),
      new TextEncoder().encode(`${headerSeg}.${payloadSeg}`),
    );
    return ok ? 'valid' : 'invalid';
  } catch {
    // 키 형식 문제 등. 검증을 못 한 것이지 위조로 단정할 근거는 아니다.
    return 'unverified';
  }
}

async function findKey(jwksUri: string, kid: string | undefined): Promise<JsonWebKey | null> {
  const cached = jwksCache.get(jwksUri);
  const hit = cached ? pick(cached.keys, kid) : null;
  if (hit) return hit;
  // 캐시에 없는 kid → 키가 교체됐을 수 있다. 다만 매번 다시 읽지는 않는다.
  if (cached && Date.now() - cached.fetchedAt < REFETCH_COOLDOWN_MS) return null;

  const keys = await fetchJwks(jwksUri);
  if (!keys) return null;
  jwksCache.set(jwksUri, { keys, fetchedAt: Date.now() });
  return pick(keys, kid);
}

/** kid 가 맞는 키. kid 가 없으면 키가 하나뿐일 때만 그것을 쓴다(고르는 근거가 없으므로). */
function pick(keys: JsonWebKey[], kid: string | undefined): JsonWebKey | null {
  if (kid) {
    return keys.find((k) => (k as { kid?: string }).kid === kid) ?? null;
  }
  return keys.length === 1 ? keys[0] : null;
}

async function fetchJwks(jwksUri: string): Promise<JsonWebKey[] | null> {
  try {
    const res = await fetch(jwksUri);
    if (!res.ok) return null;
    const body = (await res.json()) as Jwks;
    return Array.isArray(body.keys) ? body.keys : null;
  } catch {
    return null;
  }
}

function decodeSegment<T>(segment: string): T | null {
  try {
    const json = new TextDecoder().decode(base64urlToBytes(segment));
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

function base64urlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const binary = atob(padded);
  // ArrayBuffer 로 명시한다 — 기본 Uint8Array 타입은 SharedArrayBuffer 도 품어서
  // crypto.subtle(BufferSource) 에 그대로 못 넘긴다.
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
