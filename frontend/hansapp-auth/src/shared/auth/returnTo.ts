/**
 * 1st-party 복귀(return) 검증.
 *
 * 콘솔(plzhans.com) 같은 자사 앱은 OAuth code 없이 쿠키로 로그인한다 — hans-auth 로 보내
 * 로그인만 하면 백엔드가 `.plzhans.com` refresh 쿠키를 깔고, 여기서 원래 앱(return)으로 돌려보낸다.
 * 앱은 복귀 후 그 쿠키로 세션을 인지한다(리다이렉트 code 교환 없음).
 *
 * **복귀 URL 은 저장소가 아니라 흐름으로 운반한다.** 소셜은 콜백 URL 의 `ret=`(백엔드 서명 state 의
 * returnTo 로 왕복 → 위변조 불가), 이메일은 현재 URL 의 `return` 을 바로 쓴다. sessionStorage 를
 * 안 써서 이중 로그인 창·저장소 유실에도 안전하다.
 *
 * open-redirect 방지: return 은 **허용 오리진**(VITE_RETURN_ORIGINS, 콤마구분)일 때만 따른다.
 */

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
