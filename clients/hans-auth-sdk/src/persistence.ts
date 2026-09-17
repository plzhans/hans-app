/**
 * 저장소 추상화.
 *
 * SDK 자체는 웹 표준 API 만 쓴다. 네이티브 저장소(Capacitor 등)는 쓰는 쪽이 어댑터를
 * 만들어 넘긴다 — firebase 가 getReactNativePersistence(AsyncStorage) 로 하는 것과 같다.
 * 그래서 웹 전용 앱은 아무것도 설치하지 않아도 되고, SDK 도 네이티브 패키지를 의존하지 않는다.
 */

/** 비동기 키-값 저장소. oidc-client-ts 의 StateStore 와 같은 모양이다. */
export interface StateStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  /** 접두사로 훑어 정리하는 데 쓴다(PKCE 의 만료 항목 청소). */
  getAllKeys(): Promise<string[]>;
}

/**
 * 한 플랫폼이 제공하는 저장소 묶음. persistence 모드가 이 중 하나를 고른다.
 *
 * 'device'·'browser' 는 네이티브에서 구현이 갈리지만 'tab'(sessionStorage)은 웹뷰에서도
 * 같아서, tab 은 안 주면 기본 구현을 쓴다.
 */
export interface PlatformStorage {
  /** 기기에 남는다. 'device' 모드와 PKCE verifier 가 쓴다. */
  local: StateStore;
  /** 브라우저를 닫으면 사라진다. 'browser' 모드가 쓴다. */
  session: StateStore;
  /** 탭을 닫으면 사라진다. 'tab' 모드가 쓴다. */
  tab?: StateStore;
}

/** Web Storage(localStorage·sessionStorage)를 StateStore 로 감싼다. */
function webStorageStore(pick: () => Storage): StateStore {
  return {
    async get(key) {
      return pick().getItem(key);
    },
    async set(key, value) {
      pick().setItem(key, value);
    },
    async remove(key) {
      pick().removeItem(key);
    },
    async getAllKeys() {
      const store = pick();
      return Array.from({ length: store.length }, (_, i) => store.key(i)).filter(
        (key): key is string => key !== null,
      );
    },
  };
}

/*
  쿠키 인코딩은 Capacitor 의 웹 구현(js-cookie 방식)을 그대로 따른다. 여기서 규칙이 달라지면
  이미 로그인해 둔 사람의 쿠키를 못 읽어 세션이 끊긴다.
*/
const encodeCookie = (value: string): string =>
  encodeURIComponent(value)
    .replace(/%(2[346B]|5E|60|7C)/g, decodeURIComponent)
    .replace(/[()]/g, escape);

const decodeCookie = (value: string): string =>
  value.replace(/(%[\dA-F]{2})+/gi, decodeURIComponent);

function readCookies(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const cookie of document.cookie.split(';')) {
    if (cookie.length <= 0) continue;
    // 값에 '=' 가 들어 있어도 첫 번째에서만 자른다.
    const split = cookie.indexOf('=');
    if (split < 0) continue;
    const key = decodeCookie(cookie.slice(0, split)).trim();
    map[key] = decodeCookie(cookie.slice(split + 1)).trim();
  }
  return map;
}

/**
 * 세션 쿠키 저장소. expires 를 주지 않아 브라우저를 닫으면 사라진다.
 *
 * 지울 때 만료 시각을 과거로 준 set 을 쓴다 — `Max-Age=0` 만 보내면 path 가 안 붙어서
 * 지금 보고 있는 경로에만 삭제 쿠키가 서고, path=/ 로 저장된 진짜 쿠키는 살아남는다.
 */
const cookieStore: StateStore = {
  async get(key) {
    return readCookies()[key] ?? null;
  },
  async set(key, value) {
    document.cookie = `${encodeCookie(key)}=${encodeCookie(value)}; path=/;`;
  },
  async remove(key) {
    document.cookie = `${encodeCookie(key)}=; expires=${new Date(0).toUTCString()}; path=/;`;
  },
  async getAllKeys() {
    return Object.keys(readCookies());
  },
};

/** 브라우저 기본 구현. 네이티브 어댑터를 안 넘기면 이것을 쓴다. */
export const webStorage: PlatformStorage = {
  local: webStorageStore(() => localStorage),
  session: cookieStore,
  tab: webStorageStore(() => sessionStorage),
};
