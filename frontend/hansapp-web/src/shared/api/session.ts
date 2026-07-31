import {
  clearAccessToken,
  loadAccessToken,
  saveAccessToken,
} from '@/shared/storage/tokenStore';
import {
  APP_ROOT_DOMAIN,
  SESSION_HINT_COOKIE as HINT_COOKIE,
} from '@/shared/config/env';
import type { Me } from './auth';

const ME_KEY = 'hansapp.me';

// 프로필 캐시 수명. 표시 전용이라 staleness 는 저위험이지만 무기한이면 서버 변경이 영영 안 보인다.
// access token 수명(백엔드 AUTH_ACCESS_TOKEN_TTL_SEC 기본 3600s)과 맞춰둔다 — access 가 만료되면
// 어차피 refresh+getMe 로 캐시가 갱신되므로, 이 값 이하에서는 추가 getMe 없이 lockstep 으로 신선도가 유지된다.
const ME_TTL_MS = 60 * 60 * 1000; // 1h

interface CachedMe {
  me: Me;
  /** epoch millis. 이 시각을 지나면 캐시를 버리고 서버로 다시 조회한다. */
  exp: number;
}

/**
 * 현재 토큰의 인메모리 캐시. 매 요청마다 비동기 저장소를 읽지 않도록 부팅 시 1회 hydrate 하고
 * 로그인/갱신 때 갱신한다. 영속 저장소(tokenStore)와 항상 동기화한다.
 */
let current: string | null = null;

export function getSession(): string | null {
  return current;
}

export async function hydrateSession(): Promise<string | null> {
  current = loadAccessToken();
  return current;
}

export async function setSession(accessToken: string): Promise<void> {
  current = accessToken;
  saveAccessToken(accessToken);
}

export async function clearSession(): Promise<void> {
  current = null;
  clearAccessToken();
}

/**
 * 로그인 힌트 쿠키(백엔드가 로그인 때 세팅한 non-httpOnly `hansapp.session` flag) 존재 여부.
 * **이게 있을 때만** refresh 를 호출한다 — 로그아웃 상태에서 불필요한 /oauth/token 400 을 없앤다.
 * 인증 판단이 아니라 "호출 여부" 판단용(값은 신뢰하지 않는다).
 */
export function hasSessionHint(): boolean {
  return document.cookie
    .split(';')
    .some((c) => c.trim().startsWith(`${HINT_COOKIE}=`));
}

/**
 * 힌트 쿠키를 지운다. **서버가 refresh 를 거절했을 때** 쓴다.
 *
 * 로그아웃은 서버가 지워주지만, 세션 만료·관리자 폐기·비밀번호 재설정처럼 서버가 응답에
 * 쿠키를 실을 수 없는 경로에서는 힌트만 남는다. 그대로 두면 매 방문마다 헛되이 refresh 를
 * 치고, 더 나쁘게는 "세션이 있다"고 오판해 앱 사이를 왕복하게 된다.
 *
 * 심을 때와 **같은 domain·path** 여야 브라우저가 지운다(백엔드 setSessionHint 와 짝).
 */
export function clearSessionHint(): void {
  const base = `${HINT_COOKIE}=; Max-Age=0; path=/`;
  document.cookie = base;
  if (APP_ROOT_DOMAIN) document.cookie = `${base}; domain=.${APP_ROOT_DOMAIN}`;
}

// ── 프로필 캐시 + access 만료 로컬검증 ──
// 새로고침마다 서버(getMe·refresh)를 때리지 않게, access token 이 아직 유효하면 캐시된 프로필로
// 바로 로그인 표시한다(DB 0). 만료됐을 때만 서버로 간다.

/** 프로필을 TTL 과 함께 로컬에 캐시한다(표시용). */
export function saveMe(me: Me): void {
  try {
    const entry: CachedMe = { me, exp: Date.now() + ME_TTL_MS };
    localStorage.setItem(ME_KEY, JSON.stringify(entry));
  } catch {
    // 스토리지 불가(사파리 프라이빗 등)면 캐시 없이 동작한다.
  }
}

/** 캐시된 프로필. 없거나 TTL 만료면 null(만료분은 정리한다). */
export function loadMe(): Me | null {
  try {
    const s = localStorage.getItem(ME_KEY);
    if (!s) return null;
    const entry = JSON.parse(s) as Partial<CachedMe>;
    if (typeof entry.exp !== 'number' || Date.now() >= entry.exp || !entry.me) {
      localStorage.removeItem(ME_KEY);
      return null;
    }
    return entry.me;
  } catch {
    return null;
  }
}

export function clearMe(): void {
  try {
    localStorage.removeItem(ME_KEY);
  } catch {
    // no-op
  }
}

/** access token(JWT)의 exp 를 로컬에서 확인한다. 서버 호출 없이 "아직 유효한가"만 본다(10초 여유). */
export function isAccessTokenValid(token: string | undefined): boolean {
  if (!token) return false;
  try {
    const [, payload] = token.split('.');
    const json = JSON.parse(
      atob(payload.replace(/-/g, '+').replace(/_/g, '/')),
    ) as { exp?: number };
    return typeof json.exp === 'number' && Date.now() / 1000 < json.exp - 10;
  } catch {
    return false;
  }
}
