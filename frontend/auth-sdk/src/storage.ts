import { CapacitorCookies } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

/** 저장 토큰. 웹·모바일 공용. */
export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  /** refresh 만료(ISO8601) */
  refreshExpiresAt: string;
}

/**
 * 토큰을 어디까지 살려 둘지.
 *
 *   'device'   기기에 남긴다(Capacitor Preferences → 웹은 localStorage). 다시 열어도 로그인 상태다.
 *   'browser'  **브라우저를 닫으면 사라진다**(세션 쿠키). 창이 열려 있는 동안은 모든 탭이 공유한다.
 *   'tab'      **탭을 닫으면 사라진다**(sessionStorage). 탭마다 따로 논다.
 *
 * 'browser' 가 "로그인을 남기고 싶지 않다" 는 요구에 맞는 유일한 웹 표준 범위다.
 * localStorage 는 오리진 전체지만 브라우저를 닫아도 남고, sessionStorage 는 사라지지만
 * **탭 하나**가 범위라 새 탭이 익명이 된다 — 세션 쿠키만 둘을 함께 만족한다.
 *
 * 유의할 점:
 *   - 크롬·파이어폭스의 "이전 세션 복원"(계속하기)을 켜 두면 세션 쿠키도 함께 되살아난다.
 *     sessionStorage 도 마찬가지라 이건 저장소 선택으로 피할 수 있는 문제가 아니다.
 *   - 쿠키는 4KB 상한이 있고 **같은 호스트로 가는 모든 요청에 실린다**(포트는 안 가린다).
 *     운영에서는 앱과 API 의 호스트가 달라 API 로 새어 나가지 않지만, 로컬에서 127.0.0.1 로
 *     전부 띄우면 이 쿠키가 API 요청에도 붙는다(서버는 모르는 쿠키라 무시한다).
 */
export type TokenPersistence = 'device' | 'browser' | 'tab';

/** 토큰 스토어. 키를 주입받아 앱마다 격리한다. */
export class TokenStorage {
  /** 실제로 쓸 저장소. 사용할 수 없는 환경이면 'device'(Preferences)로 떨어진다. */
  private readonly mode: TokenPersistence;

  constructor(
    private readonly key: string,
    persistence: TokenPersistence = 'device',
  ) {
    this.mode = usable(persistence) ? persistence : 'device';
  }

  async load(): Promise<StoredTokens | null> {
    const value =
      this.mode === 'browser'
        ? (await CapacitorCookies.getCookies())[this.key]
        : this.mode === 'tab'
          ? sessionStorage.getItem(this.key)
          : (await Preferences.get({ key: this.key })).value;
    if (!value) return null;
    try {
      return JSON.parse(value) as StoredTokens;
    } catch {
      return null;
    }
  }

  async save(tokens: StoredTokens): Promise<void> {
    const value = JSON.stringify(tokens);
    if (this.mode === 'browser') {
      // expires 를 주지 않는다 = 세션 쿠키. path 는 앱 전체(기본값 '/').
      await CapacitorCookies.setCookie({ key: this.key, value });
      return;
    }
    if (this.mode === 'tab') {
      sessionStorage.setItem(this.key, value);
      return;
    }
    await Preferences.set({ key: this.key, value });
  }

  async clear(): Promise<void> {
    if (this.mode === 'browser') {
      /*
        **deleteCookie 를 쓰지 않는다.** 웹 구현이 path 를 안 붙여서(`key=; Max-Age=0`)
        지금 보고 있는 경로에만 삭제 쿠키를 세운다 — `/hospitals/1` 에서 로그아웃하면
        path=/ 로 저장된 진짜 쿠키는 그대로 살아남는다. 만료 시각을 과거로 준 setCookie 는
        같은 path(/) 를 지정하므로 정확히 그 쿠키를 지운다.
      */
      await CapacitorCookies.setCookie({
        key: this.key,
        value: '',
        path: '/',
        expires: new Date(0).toUTCString(),
      });
      return;
    }
    if (this.mode === 'tab') {
      sessionStorage.removeItem(this.key);
      return;
    }
    await Preferences.remove({ key: this.key });
  }
}

/** 그 저장소를 이 환경에서 쓸 수 있는가. 접근 자체가 던지는 환경이 있다(일부 웹뷰·차단 설정). */
function usable(persistence: TokenPersistence): boolean {
  try {
    if (persistence === 'tab') return typeof sessionStorage !== 'undefined' && sessionStorage !== null;
    // 'browser'(쿠키)·'device'(Preferences)는 Capacitor 가 웹·네이티브 양쪽 구현을 갖고 있다.
    return true;
  } catch {
    return false;
  }
}
