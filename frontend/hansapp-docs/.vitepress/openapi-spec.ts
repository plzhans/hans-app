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
 * 문서에 노출하지 않을 태그. 라우트는 살아 있고 **문서에서만** 감춘다.
 *
 * 스펙 파일(docs/openapi/hansapp-openapi.json) 자체에서는 못 뺀다 —
 * medifinder-web 이 같은 파일로 react-query 훅을 생성해서(orval.config.ts) 지우면 깨진다.
 * 그래서 백엔드의 @ApiExcludeController 가 아니라 여기서 거른다.
 *
 * **사이드바에서만 지우는 건 소용없다.** apis/[tag].paths.js 는 스펙에 있는 모든 태그로
 * 페이지를 만들고(=URL 만 알면 열린다), config.ts 의 __OPENAPI_SPEC__ 는 스펙 JSON 을
 * 통째로 클라이언트 번들에 박는다. 읽는 자리가 여기 하나라 여기서 걸러야 셋 다 막힌다.
 */
const PRIVATE_TAGS = new Set([
  'app', // 헬스 체크·빌드 버전
  'auth', // 가입·로그인·비밀번호
  'auth-social',
  'oauth',
  'apps', // 개발자 콘솔(앱·API 키·클라이언트 관리)
]);

/** 스펙 파일을 읽어 파싱한다(Node 빌드 컨텍스트 전용). PRIVATE_TAGS 는 걸러낸다. */
export function loadSpec(): Record<string, unknown> {
  const spec = JSON.parse(readFileSync(specPath, 'utf-8')) as {
    paths?: Record<string, Record<string, { tags?: string[] } | undefined>>;
  };
  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    for (const verb of HTTP_VERBS) {
      const tag = item[verb]?.tags?.[0];
      if (tag && PRIVATE_TAGS.has(tag)) delete item[verb];
    }
    // 오퍼레이션이 전부 빠진 경로는 통째로 지운다(빈 껍데기가 남지 않게).
    if (!Object.keys(item).length) delete spec.paths![path];
  }
  return spec as Record<string, unknown>;
}
