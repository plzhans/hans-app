import type { Cache } from 'cache-manager';

/**
 * 캐시 한 칸의 상태. **회원 캐시들이 모두 이 모양을 쓴다**(내 정보·세션) —
 * 글 캐시(PostCacheState)와도 같아서 콘솔이 같은 화면으로 본다.
 */
export interface CacheEntryState {
  /** 환경 접두어(`develop:`)를 뺀 키. 붙이는 것은 CacheModule 이다. */
  readonly key: string;
  readonly hit: boolean;
  readonly expiresAt: Date | null;
  /** 남은 시간(ms). 만료 시각을 모르면 null. */
  readonly remainingMs: number | null;
  /** 담겨 있는 값 그대로. */
  readonly value: unknown;
  /**
   * 이 캐시가 프로세스 밖에서도 공유되나.
   *
   * **false 면 지금 보는 것은 이 프로세스의 메모리다** — 회원 API 가 다른 프로세스면
   * 그쪽이 들고 있는 것은 여기서 보이지도, 지워지지도 않는다.
   */
  readonly shared: boolean;
}

/**
 * 캐시 한 칸을 들여다본다.
 *
 * **TTL 은 cache-manager 가 아니라 그 아래 Keyv 에게 직접 묻는다**(`{ raw: true }`).
 * 위쪽 API 는 값만 돌려주고 남은 시간을 알려주지 않는다.
 *
 * **읽다 실패해도 던지지 않는다.** 이건 들여다보는 창이라, 캐시가 흔들린다고 화면이
 * 오류로 덮이면 정작 보려던 것(세션·회원 정보)까지 못 본다. 못 읽으면 "없음" 으로 답한다.
 */
export async function inspectCacheEntry(
  cache: Cache | undefined,
  key: string,
  onError: (error: unknown) => void,
): Promise<CacheEntryState> {
  const empty: CacheEntryState = {
    key,
    hit: false,
    expiresAt: null,
    remainingMs: null,
    value: null,
    shared: false,
  };
  const store = cache?.stores?.[0];
  if (!store) return empty;

  try {
    const raw = (await store.get(key, { raw: true })) as {
      value?: unknown;
      expires?: number | null;
    } | null;
    if (!raw) return { ...empty, shared: isShared(store) };

    const expires = raw.expires ?? null;
    return {
      key,
      hit: true,
      expiresAt: expires === null ? null : new Date(expires),
      remainingMs: expires === null ? null : Math.max(0, expires - Date.now()),
      value: raw.value ?? null,
      shared: isShared(store),
    };
  } catch (error) {
    onError(error);
    return empty;
  }
}

/**
 * Redis 처럼 프로세스 밖에 있는 저장소인가.
 *
 * Keyv 의 기본 저장소는 그냥 `Map` 이다 — 그것이면 이 프로세스 안에서만 사는 캐시다.
 */
function isShared(store: { opts?: { store?: unknown } }): boolean {
  return !(store.opts?.store instanceof Map);
}
