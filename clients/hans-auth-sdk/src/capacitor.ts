/**
 * Capacitor 앱용 저장소 어댑터.
 *
 * **이 파일은 @capacitor/* 를 import 하지 않는다.** 쓰는 쪽이 자기 것을 넘기고 여기서는
 * 쓰는 메서드만 구조적으로 받는다. 그래서 SDK 는 Capacitor 를 의존성으로도, peer 로도
 * 들지 않고, 웹 전용 앱은 이 모듈 자체를 import 하지 않으면 그만이다.
 *
 *   import { Preferences } from '@capacitor/preferences';
 *   import { CapacitorCookies } from '@capacitor/core';
 *   import { capacitorStorage } from '@hansapp/auth-sdk/capacitor';
 *
 *   createAuthClient({ ..., storage: capacitorStorage({ Preferences, CapacitorCookies }) });
 */

import type { PlatformStorage, StateStore } from './persistence.js';

/** @capacitor/preferences 의 Preferences 중 여기서 쓰는 부분. */
export interface PreferencesLike {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
  keys(): Promise<{ keys: string[] }>;
}

/** @capacitor/core 의 CapacitorCookies 중 여기서 쓰는 부분. */
export interface CapacitorCookiesLike {
  getCookies(): Promise<Record<string, string>>;
  setCookie(options: {
    key: string;
    value: string;
    path?: string;
    expires?: string;
  }): Promise<void>;
}

function preferencesStore(preferences: PreferencesLike): StateStore {
  return {
    async get(key) {
      return (await preferences.get({ key })).value;
    },
    async set(key, value) {
      await preferences.set({ key, value });
    },
    async remove(key) {
      await preferences.remove({ key });
    },
    async getAllKeys() {
      return (await preferences.keys()).keys;
    },
  };
}

/*
  deleteCookie 는 쓰지 않는다. 웹 구현이 path 를 안 붙여서(`key=; Max-Age=0`) 지금 보고
  있는 경로에만 삭제 쿠키를 세운다 — /hospitals/1 에서 로그아웃하면 path=/ 로 저장된
  진짜 쿠키는 그대로 살아남는다. 만료 시각을 과거로 준 setCookie 는 같은 path 를
  지정하므로 정확히 그 쿠키를 지운다.
*/
function cookieStore(cookies: CapacitorCookiesLike): StateStore {
  return {
    async get(key) {
      return (await cookies.getCookies())[key] ?? null;
    },
    async set(key, value) {
      // expires 를 주지 않는다 = 세션 쿠키. path 는 앱 전체(기본값 '/').
      await cookies.setCookie({ key, value });
    },
    async remove(key) {
      await cookies.setCookie({
        key,
        value: '',
        path: '/',
        expires: new Date(0).toUTCString(),
      });
    },
    async getAllKeys() {
      return Object.keys(await cookies.getCookies());
    },
  };
}

/** Capacitor 의 Preferences·CapacitorCookies 를 SDK 가 쓰는 모양으로 감싼다. */
export function capacitorStorage(modules: {
  Preferences: PreferencesLike;
  CapacitorCookies: CapacitorCookiesLike;
}): PlatformStorage {
  return {
    local: preferencesStore(modules.Preferences),
    session: cookieStore(modules.CapacitorCookies),
  };
}
