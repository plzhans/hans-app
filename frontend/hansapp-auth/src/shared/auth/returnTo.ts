/**
 * 1st-party 복귀(return) 처리.
 *
 * 콘솔(plzhans.com) 같은 자사 앱은 OAuth code 없이 쿠키로 로그인한다 — hans-auth 로 보내
 * 로그인만 하면 백엔드가 `.plzhans.com` refresh 쿠키를 깔고, 여기서 원래 앱(return)으로 돌려보낸다.
 * 앱은 복귀 후 그 쿠키로 세션을 인지한다(리다이렉트 code 교환 없음).
 *
 * open-redirect 방지: return 은 **허용 오리진**(VITE_RETURN_ORIGINS, 콤마구분)일 때만 따른다.
 * 소셜 로그인은 전체 페이지 왕복을 건너므로 sessionStorage 에 잠깐 보관한다(같은 오리진이라 유지됨).
 */

const KEY = 'hansauth.return';

const ALLOWED = ((import.meta.env.VITE_RETURN_ORIGINS as string | undefined) ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/** return URL 이 허용 오리진인지. 잘못된 값·미허용은 false. */
export function isAllowedReturn(url: string): boolean {
  try {
    return ALLOWED.includes(new URL(url).origin);
  } catch {
    return false;
  }
}

/** 로그인 진입 시 유효한 return 을 보관한다(소셜 왕복 대비). */
export function storeReturn(url: string | null | undefined): void {
  if (url && isAllowedReturn(url)) sessionStorage.setItem(KEY, url);
}

/** 보관된 return 을 꺼내 지운다(1회용). 없거나 무효면 null. */
export function takeReturn(): string | null {
  const url = sessionStorage.getItem(KEY);
  sessionStorage.removeItem(KEY);
  return url && isAllowedReturn(url) ? url : null;
}
