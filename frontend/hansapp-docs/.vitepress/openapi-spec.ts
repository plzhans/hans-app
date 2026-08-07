import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// 빌드 시 사용할 OpenAPI 스펙 경로.
// 기본값: 레포 루트 docs/openapi/hansapp-openapi.json (문서 프로젝트 기준 ../../docs/...)
// CI 등에서 OPENAPI_SPEC 환경변수로 덮어쓸 수 있다(환경별 스펙 지정).
//
// 경로는 실행 위치(cwd = 문서 프로젝트 루트)를 기준으로 해석한다.
// vitepress 가 config/paths 파일을 임시 위치로 번들해 실행하므로
// __dirname/import.meta.url 대신 cwd 로 앵커링하는 것이 안전하다.
export const specPath: string = resolve(
  process.cwd(),
  process.env.OPENAPI_SPEC ?? '../../docs/openapi/hansapp-openapi.json',
);

const HTTP_VERBS = [
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'options',
  'head',
  'trace',
];

/**
 * 문서에 노출하지 않을 태그. 라우트도 스펙도 살아 있고 **문서에서만** 감춘다.
 *
 * **여기 남은 것은 운영용 엔드포인트뿐이다.** 자사 전용 API(가입·로그인·계정관리·개발자
 * 콘솔)는 이제 백엔드에서 @ApiExcludeController/@ApiExcludeEndpoint 로 **스펙에 애초에
 * 안 실린다** — 스펙의 뜻이 "외부가 부를 수 있는 것" 하나로 정리됐다.
 *
 * 예전에는 여기서 다 걸렀는데, 그러면 정본이 백엔드와 문서 둘로 갈린다. 실제로
 * `/auth/me` → `/users/me` 이관 때 이 목록만 옛 operationId 를 가리켜 "내 정보" 가
 * 문서에서 통째로 사라진 적이 있다. 거르는 자리는 하나여야 한다.
 *
 * **사이드바에서만 지우는 건 소용없다.** apis/[tag].paths.js 는 스펙에 있는 모든 태그로
 * 페이지를 만들고(=URL 만 알면 열린다), config.ts 의 __OPENAPI_SPEC__ 는 스펙 JSON 을
 * 통째로 클라이언트 번들에 박는다. 읽는 자리가 여기 하나라 여기서 걸러야 셋 다 막힌다.
 */
const PRIVATE_TAGS = new Set([
  'app', // 헬스 체크·빌드 버전 — 부를 수는 있지만 연동과 무관하다
]);

/**
 * 문서에서 쓸 태그 이름으로 바꾼다. 백엔드 태그는 코드 구조를 따르고,
 * 문서 태그는 읽는 사람이 찾는 이름을 따른다.
 */
const TAG_RENAME: Record<string, string> = {
  users: 'account', // 사용자 — 토큰 발급(oauth)과 한 그룹으로 묶인다
};

/**
 * 태그와 무관하게 감출 오퍼레이션(operationId).
 *
 * 연동하는 쪽이 부를 일이 없는, 우리 웹 전용 엔드포인트를 여기 적는다.
 */
const PRIVATE_OPERATIONS = new Set([
  // 로그아웃은 우리 웹이 자기 쿠키를 지우는 자리다. 연동 앱은 받은 토큰을 폐기하면 된다.
  'OAuthController_logout',
]);

/** 스펙 파일을 읽어 파싱한다(Node 빌드 컨텍스트 전용). 비공개 오퍼레이션은 걸러낸다. */
export function loadSpec(): Record<string, unknown> {
  const spec = JSON.parse(readFileSync(specPath, 'utf-8')) as {
    paths?: Record<string, Record<string, { tags?: string[] } | undefined>>;
  };
  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    for (const verb of HTTP_VERBS) {
      const op = item[verb] as
        | { tags?: string[]; operationId?: string }
        | undefined;
      const tag = op?.tags?.[0];
      if (!tag) continue;
      if (op?.operationId && PRIVATE_OPERATIONS.has(op.operationId)) {
        delete item[verb];
        continue;
      }
      if (PRIVATE_TAGS.has(tag)) {
        delete item[verb];
        continue;
      }
      const renamed = TAG_RENAME[tag];
      if (renamed) op.tags = [renamed];
    }
    // 오퍼레이션이 전부 빠진 경로는 통째로 지운다(빈 껍데기가 남지 않게).
    if (!Object.keys(item).length) delete spec.paths![path];
  }
  return spec as Record<string, unknown>;
}

/**
 * 태그별 오퍼레이션 노출 순서(operationId). 여기 적은 것이 먼저, 나머지는 스펙 순서대로 뒤에 붙는다.
 *
 * 스펙의 순서는 **컨트롤러에 메서드를 적은 순서**라 문서에서 읽는 순서와 다를 수 있다 —
 * 토큰 페이지는 인가코드를 먼저 받고 그걸 토큰으로 바꾸는 순서로 읽혀야 한다.
 */
export const OPERATION_ORDER: Record<string, string[]> = {
  oauth: ['OAuthController_authorize', 'OAuthController_token'],
};

/** OPERATION_ORDER 를 적용해 정렬한다. 목록에 없는 것은 원래 순서를 지킨다. */
export function sortOperations<T extends { operationId?: string }>(
  tag: string,
  ops: T[],
): T[] {
  const order = OPERATION_ORDER[tag];
  if (!order) return ops;
  const rank = (id?: string) => {
    const i = order.indexOf(id ?? '');
    return i < 0 ? order.length : i;
  };
  return [...ops].sort((a, b) => rank(a.operationId) - rank(b.operationId));
}
