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
/**
 * 설정에서 읽은 서비스 루트 도메인 값을 정규화·검증한다. 앞 점(.) 제거 + 트림 후:
 *  - 빈값 → undefined
 *  - **IPv4·IPv6·점 없는 단일 라벨(localhost 등)** → 쿠키 Domain 으로 못 쓴다(브라우저가 거부).
 *    → **경고 로그 후 무시(undefined)**. 그래야 잘못 설정해도 깨진 Domain 쿠키를 심지 않고
 *      host-only 쿠키 + 루프백 폴백으로 안전하게 동작한다(fail-safe).
 *  - 그 외(점 포함 도메인) → 그대로 사용.
 */
export function normalizeRootDomain(raw: string | undefined): string | undefined {
  const value = raw?.replace(/^\./, '').trim();
  if (!value) return undefined;
  const reason = invalidRootDomainReason(value);
  if (reason) {
    console.warn(
      `[config] auth.rootDomain='${value}' is ${reason}, so it cannot be a cookie Domain — ignoring it. ` +
        `The root domain must be a domain name containing a dot (for example plzhans.com). ` +
        `On localhost (127.0.0.1/localhost) leave it empty — host-only cookies with a loopback fallback take over.`,
    );
    return undefined;
  }
  return value;
}

/** rootDomain 으로 못 쓰는 형태면 사유(영어 명사구), 쓸 수 있으면 null. 위 문장에 끼워진다. */
function invalidRootDomainReason(host: string): string | null {
  // IPv6: 콜론 포함(::1, 2001:db8::1) 또는 대괄호 형태([::1])
  if (host.includes(':') || /^\[.*\]$/.test(host)) return 'an IPv6 address';
  // IPv4: 1.2.3.4 형태
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return 'an IPv4 address';
  // 점 없는 단일 라벨(localhost 등) — 서브도메인 공유 불가 + 브라우저가 Domain 으로 거부
  if (!host.includes('.')) return 'a single label with no dot (localhost and the like)';
  return null;
}

export function isFirstPartyOrigin(origin: string, rootDomain: string | undefined): boolean {
  let host: string;
  try {
    host = new URL(origin).hostname;
  } catch {
    return false;
  }
  if (rootDomain) {
    return host === rootDomain || host.endsWith(`.${rootDomain}`);
  }
  return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]';
}
