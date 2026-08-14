import type { Me } from './api';

/**
 * 로그인 관련 로컬 보관물. 토큰은 여기 없다(그건 SDK 가 관리한다).
 *
 * 여기 있는 것은 **화면을 먼저 그리기 위한 값**과 **리다이렉트를 왕복하는 동안 잃으면
 * 안 되는 값**이다. 둘 다 없어도 기능은 돌아가고, 손실돼도 사용자가 손해 보지 않는다.
 *
 * **sessionStorage 를 쓴다.** 토큰(세션 쿠키)보다 짧은 수명이라 안전한 방향으로 어긋난다 —
 * 캐시가 먼저 비면 서버에서 다시 받아오면 그만이다. 반대로 이름·이메일이 로그인보다 오래
 * 기기에 남는 일은 없어야 한다.
 */

const ME_KEY = 'medifinder.auth.me';
const RETURN_KEY = 'medifinder.auth.returnTo';

/**
 * 마지막으로 본 내 정보. 부팅 첫 페인트에 이름을 그리는 데 쓴다.
 *
 * 서버 응답이 오기 전까지의 임시값이라 **판단 근거로 쓰지 않는다** — 로그인 여부는 언제나
 * 토큰이 정한다. 캐시만 남고 토큰이 없으면 그냥 익명이다.
 */
export function loadMe(): Me | null {
  const raw = read(ME_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Me;
  } catch {
    return null;
  }
}

export function saveMe(me: Me): void {
  write(ME_KEY, JSON.stringify(me));
}

export function clearMe(): void {
  remove(ME_KEY);
}

/**
 * 로그인하러 떠나기 전에 있던 자리. 콜백이 돌아와 이곳으로 되돌린다.
 *
 * PKCE verifier 와 달리 state 로 나누지 않는다 — 탭 두 개가 동시에 로그인하면 나중 것이
 * 이기지만, 최악이라도 "다른 탭에서 보던 화면으로 돌아간다" 정도다. 토큰 교환처럼
 * 틀리면 로그인이 깨지는 값이 아니다.
 */
export function saveReturnTo(path: string): void {
  write(RETURN_KEY, path);
}

/** 꺼내면서 지운다. 다음 로그인이 옛 자리로 되돌리면 안 된다. */
export function takeReturnTo(): string | null {
  const value = read(RETURN_KEY);
  remove(RETURN_KEY);
  // 오픈 리다이렉트 방지: 이 앱 안의 절대경로만 받는다(`//evil.com` 은 경로가 아니다).
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null;
  return value;
}

// ---- 내부 ----
//
// 저장소가 막힌 환경(사파리 프라이빗의 옛 버전, 일부 웹뷰)에서는 접근 자체가 던진다.
// 여기 있는 값은 전부 "있으면 좋은 것" 이라, 못 쓰면 조용히 없는 셈 친다.

function read(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // 무시.
  }
}

function remove(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // 무시.
  }
}
