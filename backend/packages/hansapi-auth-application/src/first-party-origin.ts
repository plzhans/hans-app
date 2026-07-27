/**
 * origin(스킴//host[:port]) 또는 URL 문자열이 **1st-party(자사)** 인지 판별한다.
 *
 *  - rootDomain(APP_ROOT_DOMAIN) 설정: host 가 그 도메인 자신이거나 서브도메인이면 1st-party.
 *    → SSO 쿠키(rootDomain) 공유 범위와 "1st-party 정의"를 정확히 일치시킨다.
 *  - 미설정(로컬 개발): 루프백(127.0.0.1·localhost·::1)만 1st-party. 운영은 rootDomain 이 항상
 *    설정되므로 이 분기는 로컬에서만 탄다. 운영에서 실수로 미설정이면 자사 origin 이 전부 거부돼
 *    **fail-closed**(열리지 않고 막힌다) — 안전한 방향으로 깨진다.
 *
 * origin 파싱 실패는 false. 이 판별은 쿠키를 자격증명으로 쓰는 경로의 CSRF 방어에 쓰이므로,
 * "모르면 통과"가 아니라 "모르면 거부"여야 한다.
 */
export function isFirstPartyOrigin(
  origin: string,
  rootDomain: string | undefined,
): boolean {
  let host: string;
  try {
    host = new URL(origin).hostname;
  } catch {
    return false;
  }
  if (rootDomain) {
    return host === rootDomain || host.endsWith(`.${rootDomain}`);
  }
  return (
    host === '127.0.0.1' ||
    host === 'localhost' ||
    host === '::1' ||
    host === '[::1]'
  );
}
