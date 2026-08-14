/**
 * Swagger UI 의 섹션(태그) 정렬자.
 *
 * **이 함수들은 브라우저에서 돈다.** Nest 가 swaggerOptions 를 HTML 로 내보낼 때 함수는
 * `fn.toString()` 으로 본문만 실려 나가므로(@nestjs/swagger 의 buildJSInitOptions),
 * 클로저가 통째로 사라진다. 바깥 상수·import 를 참조하면 런타임에 터진다 —
 * **본문 안에서 모든 것이 끝나야 한다.**
 *
 * 그래서 앱마다 하나씩 두고 본문을 복제한다. 공용 헬퍼로 뽑거나 우선순위 목록을 인자로
 * 받는 팩토리로 만들면, 그 참조가 직렬화를 넘어가지 못해 화면에서 조용히 깨진다.
 *
 * [묶는 규칙 — 두 정렬자가 공유한다]
 * `-` 와 `.` 을 같은 구분자로 보고 첫 조각을 그룹 이름으로 삼는다.
 *
 *   auth, auth.internal, auth-social.internal   → 그룹 `auth`
 *   healthcare, healthcare-meta                 → 그룹 `healthcare`
 *   admins, admins.me                           → 그룹 `admins`
 *
 * 그룹끼리는 이름순, 그룹 안에서는 기본 태그를 먼저 세우고 `.internal` 을 그 뒤에 붙인다.
 * 그래서 공개 API 와 그 짝인 내부 API 가 항상 이웃한다.
 *
 * [앞자리 — 앱마다 다르다]
 * "인증, 그리고 **부르는 사람 자신**" 을 앞에 세운다. 그 자신이 누구인지가 앱마다 달라서
 * 목록이 갈린다. 공개 API 는 회원(`users`)이 곧 호출자지만, 관리자 문서에서 `users` 는
 * 내가 관리하는 남이라 앞자리 대상이 아니다 — 거기서 호출자는 `admins` 다.
 *
 * 등장순(컨트롤러 등록 순서)을 쓰지 않는 이유는 비교자가 태그 이름 둘만 받기 때문이다 —
 * 순서를 알 방법이 없어 규칙으로 표현할 수 없다.
 */

/** 공개 API 문서(hansapp-api). 앞자리는 `auth` → `users`(호출자 본인). */
export const swaggerTagsSorter = (a: string, b: string): number => {
  const groupOf = (tag: string): string => tag.split(/[-.]/)[0];
  const baseOf = (tag: string): string => tag.replace(/\.internal$/, '');
  const rankOf = (tag: string): number => {
    const index = ['auth', 'users'].indexOf(groupOf(tag));
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };

  const rankCompared = rankOf(a) - rankOf(b);
  if (rankCompared !== 0) return rankCompared;

  const groupCompared = groupOf(a).localeCompare(groupOf(b));
  if (groupCompared !== 0) return groupCompared;

  // 같은 그룹 안. 기본 태그가 먼저 오고(`auth` < `auth-social`), 같은 기본 태그면
  // 공개가 `.internal` 보다 앞선다(`auth` < `auth.internal`).
  return baseOf(a).localeCompare(baseOf(b)) || a.localeCompare(b);
};

/** 관리자 API 문서(hansapp-admin-api). 앞자리는 `auth` → `admins`(호출자 본인). */
export const adminSwaggerTagsSorter = (a: string, b: string): number => {
  const groupOf = (tag: string): string => tag.split(/[-.]/)[0];
  const baseOf = (tag: string): string => tag.replace(/\.internal$/, '');
  const rankOf = (tag: string): number => {
    const index = ['auth', 'admins'].indexOf(groupOf(tag));
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };

  const rankCompared = rankOf(a) - rankOf(b);
  if (rankCompared !== 0) return rankCompared;

  const groupCompared = groupOf(a).localeCompare(groupOf(b));
  if (groupCompared !== 0) return groupCompared;

  return baseOf(a).localeCompare(baseOf(b)) || a.localeCompare(b);
};
