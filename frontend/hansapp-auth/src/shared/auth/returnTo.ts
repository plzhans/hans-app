import { APP_ROOT_DOMAIN } from '@/shared/config/env';

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
 * **왜 프론트가 이 리다이렉트를 하나?** 이메일 로그인은 `fetch`(AJAX)라 응답이 JSON 이고
 * 브라우저가 이동하지 않는다 — SPA 가 직접 `window.location` 으로 복귀시켜야 한다. 소셜은
 * 전체 페이지 이동이라 백엔드가 `res.redirect` 로 돌려보내며 거기서 이미 오리진을 검증한다.
 * 즉 프론트 검증이 유일하게 필요한 곳은 이메일 복귀뿐이고, 소셜 콜백은 방어적 이중 확인이다.
 *
 * open-redirect 방지: **판정은 백엔드 isFirstPartyOrigin 과 동일**하다 — return 의 host 가 서비스
 * 루트 도메인(APP_ROOT_DOMAIN) 자신이거나 그 서브도메인이면 허용. 미설정(로컬)이면 루프백만 허용.
 * 별도 허용목록(env)을 두지 않아 자사 앱이 늘어도 설정을 건드릴 필요가 없다.
 */

/** return URL 이 1st-party(서비스 루트 도메인 계열, 또는 로컬 루프백)인지. 잘못된 값은 false. */
export function isFirstPartyReturn(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  if (APP_ROOT_DOMAIN) {
    return host === APP_ROOT_DOMAIN || host.endsWith(`.${APP_ROOT_DOMAIN}`);
  }
  return (
    host === '127.0.0.1' ||
    host === 'localhost' ||
    host === '::1' ||
    host === '[::1]'
  );
}
