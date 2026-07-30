/**
 * 접속 URL 의 자격증명(user:password) 구간만 퍼센트 인코딩한다.
 *
 * **.env 에는 실제 비밀번호가 그대로 적힌다.** 사람이 파일을 열어 본 값과 DB 에 들어 있는 값이
 * 달라지면 안 되기 때문이다. 그런데 URL 은 `@` `#` `:` 가 구분자인 포맷이라, 비밀번호에 그런
 * 문자가 있으면 파서가 엉뚱한 데서 자른다 — 예를 들어 `#` 는 프래그먼트 시작이라
 *
 *   mysql://user:ab#cd@10.0.0.1:3306/db  →  host=user, port='ab'  →  invalid port number
 *
 * 가 된다. 그래서 **읽는 순간**에 규격에 맞는 형태로 바꿔 넘긴다. 저장은 사람 기준,
 * 전달은 파서 기준 — 그 변환을 여기 한 곳이 맡는다.
 *
 * 경계를 찾는 근거:
 *   - 호스트에는 `@` 가 못 들어간다 → 자격증명은 **마지막 `@`** 에서 끝난다
 *   - 사용자명에는 `:` 를 쓰지 않는다 → 사용자/비밀번호는 **첫 `:`** 로 갈린다
 * 덕분에 비밀번호에 `@` `#` `$` `&` 가 몇 개 있든 정확히 잘린다.
 *
 * 다만 비밀번호의 `/` `?` 는 지원하지 않는다 — 자격증명 구간의 끝을 경로/쿼리로 잡기 때문이다.
 * 그 두 문자는 대부분의 DB 도구가 함께 걸려 넘어지므로 비밀번호에서 빼는 편이 낫다.
 */
export function normalizeConnectionUrl(raw: string): string {
  const schemeEnd = raw.indexOf('://');
  if (schemeEnd < 0) {
    return raw;
  }
  const scheme = raw.slice(0, schemeEnd);
  const rest = raw.slice(schemeEnd + 3);

  // 자격증명은 경로 앞에만 있다. 쿼리에 `@` 가 섞여 있어도 여기서 걸러진다.
  const pathStart = rest.indexOf('/');
  const authority = pathStart < 0 ? rest : rest.slice(0, pathStart);

  const at = authority.lastIndexOf('@');
  if (at < 0) {
    // 자격증명이 없는 URL(예: 로컬 redis). 손댈 것이 없다.
    return raw;
  }

  const credential = authority.slice(0, at);
  const tail = rest.slice(at + 1);

  const colon = credential.indexOf(':');
  const user = colon < 0 ? credential : credential.slice(0, colon);
  const password = colon < 0 ? '' : credential.slice(colon + 1);

  // 이미 인코딩된 값을 다시 인코딩하지 않는다 — .env 는 실제 값을 담는다는 전제이므로
  // 여기 들어오는 것은 언제나 원문이다. `%` 자체도 %25 로 나가는 것이 맞다.
  const encoded = colon < 0 ? enc(user) : `${enc(user)}:${enc(password)}`;
  return `${scheme}://${encoded}@${tail}`;
}

/**
 * encodeURIComponent 는 `!` `'` `(` `)` `*` 를 남기는데, 이들은 URL 자격증명 구간에서
 * 구분자가 아니라 그대로 둬도 안전하다. 반대로 `@` `#` `:` `/` `?` `&` `=` 는 인코딩된다.
 */
function enc(value: string): string {
  return encodeURIComponent(value);
}
