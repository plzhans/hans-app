/**
 * OIDC discovery(`/.well-known/openid-configuration`)로 인증 엔드포인트를 알아낸다.
 *
 * 주소를 앱마다 하드코딩하면 서버가 경로를 바꿀 때 배포된 클라이언트가 전부 깨진다.
 * discovery 를 한 번 읽으면 로그인 화면·토큰 교환·공개키 위치가 서버 쪽 설정을 따라온다.
 *
 * **discovery 를 못 읽어도 로그인은 된다.** 값이 없으면 관례 경로로 되돌아간다 —
 * 인증 서버가 잠깐 흔들린다고 로그인 버튼이 죽는 것이 더 나쁘다.
 */

/** discovery 문서에서 우리가 쓰는 값만. */
export interface AuthEndpoints {
  /** 로그인 UI. 전체 페이지 이동으로 사용자를 보낸다. */
  authorizationEndpoint: string;
  /** 인가코드 교환·refresh 회전. */
  tokenEndpoint: string;
  /** access token 서명 검증용 공개키셋. */
  jwksUri: string;
}

interface DiscoveryDocument {
  authorization_endpoint?: string;
  token_endpoint?: string;
  jwks_uri?: string;
}

/** discovery 를 기다리다 로그인이 멈추지 않게 하는 상한(ms). */
const TIMEOUT_MS = 3000;

export interface DiscoveryInput {
  apiBaseUrl: string;
  authWebUrl: string;
  /** 결과를 담아 둘 localStorage 키. 없으면 매번 새로 읽는다. */
  cacheKey?: string;
}

/**
 * 캐시 수명. 서버가 주소를 바꾸면 최대 이만큼 늦게 반영된다.
 *
 * **왜 캐시하나.** 로그인은 리다이렉트로 페이지가 두 번 갈린다(로그인 클릭 → 콜백 복귀).
 * 캐시가 없으면 콜백 화면에서 discovery 를 **다시** 읽고, 그게 끝나야 토큰 교환이 시작된다 —
 * 사용자에게는 빈 화면이 그만큼 길어진다. 공개 설정값이라 담아 둬도 위험하지 않다.
 */
const CACHE_TTL_MS = 60 * 60 * 1000;

interface CachedDiscovery {
  /** 이 값을 어떤 API 주소로 읽었는지. 환경이 바뀌면(로컬↔develop) 버려야 한다. */
  apiBaseUrl: string;
  expiresAt: number;
  endpoints: AuthEndpoints;
}

/**
 * discovery 를 읽어 엔드포인트를 정한다. 실패하면 관례 경로.
 *
 * **token_endpoint·jwks_uri 는 apiBaseUrl 과 같은 오리진일 때만 받아들인다.**
 * 서버는 이 둘을 `issuer` 로 조립하는데, issuer 는 토큰의 `iss` 클레임에 쓰는 **이름**이라
 * API 주소와 같으리라는 보장이 없다(develop 은 issuer 가 웹 호스트로 잡혀 있다).
 * 그대로 믿으면 토큰 교환이 API 가 아닌 곳으로 날아가 로그인이 통째로 실패한다.
 * 로그인 UI(authorization_endpoint)는 애초에 다른 호스트라 이 검사를 하지 않는다.
 */
export async function discoverEndpoints({
  apiBaseUrl,
  authWebUrl,
  cacheKey,
}: DiscoveryInput): Promise<AuthEndpoints> {
  const cached = readCache(cacheKey, apiBaseUrl);
  if (cached) return cached;

  const fallback: AuthEndpoints = {
    authorizationEndpoint: `${authWebUrl}/login`,
    tokenEndpoint: `${apiBaseUrl}/oauth/token`,
    jwksUri: `${apiBaseUrl}/.well-known/jwks.json`,
  };

  const doc = await fetchDiscovery(apiBaseUrl);
  // 읽기 실패는 담아 두지 않는다. 잠깐 못 읽은 것을 한 시간 동안 사실로 굳히면 안 된다.
  if (!doc) return fallback;

  const endpoints: AuthEndpoints = {
    authorizationEndpoint: doc.authorization_endpoint ?? fallback.authorizationEndpoint,
    tokenEndpoint: sameOrigin(doc.token_endpoint, apiBaseUrl) ?? fallback.tokenEndpoint,
    jwksUri: sameOrigin(doc.jwks_uri, apiBaseUrl) ?? fallback.jwksUri,
  };
  writeCache(cacheKey, apiBaseUrl, endpoints);
  return endpoints;
}

// ---- 캐시 ----
//
// localStorage 를 쓴다. 토큰과 달리 **공개 설정값**이라 브라우저를 닫아도 남아 있어도 된다 —
// 오히려 남아 있어야 다음 방문의 첫 로그인도 빠르다. 못 쓰는 환경이면 그냥 캐시가 없는 셈이다.

function readCache(cacheKey: string | undefined, apiBaseUrl: string): AuthEndpoints | null {
  if (!cacheKey) return null;
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedDiscovery;
    if (cached.apiBaseUrl !== apiBaseUrl || cached.expiresAt <= Date.now()) return null;
    return cached.endpoints;
  } catch {
    return null;
  }
}

function writeCache(
  cacheKey: string | undefined,
  apiBaseUrl: string,
  endpoints: AuthEndpoints,
): void {
  if (!cacheKey) return;
  const value: CachedDiscovery = {
    apiBaseUrl,
    expiresAt: Date.now() + CACHE_TTL_MS,
    endpoints,
  };
  try {
    localStorage.setItem(cacheKey, JSON.stringify(value));
  } catch {
    // 캐시는 없어도 된다.
  }
}

async function fetchDiscovery(apiBaseUrl: string): Promise<DiscoveryDocument | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${apiBaseUrl}/.well-known/openid-configuration`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as DiscoveryDocument;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** url 이 base 와 같은 오리진이면 그대로, 아니면 null. */
function sameOrigin(url: string | undefined, base: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin === new URL(base).origin ? url : null;
  } catch {
    return null;
  }
}
