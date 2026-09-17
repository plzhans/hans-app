import { apiGet } from './api';
import type { Env } from './env';
import type { Lang } from './routing';
import { HOME_QUERY_PATHS } from '../../dist-server/entry-server.js';
import type { HealthcareHospitalControllerSearch200 } from '@hansapp/api-sdk';

export type HomeSection = HealthcareHospitalControllerSearch200;

/**
 * 홈의 추천 섹션 여섯 개. 조회 조건은 화면(Home.tsx 의 SECTIONS)이 정하고, 여기서는
 * 그 경로를 순서대로 받아 오기만 한다. 반환 순서가 곧 섹션 순서다.
 *
 * 병렬로 부른다. 순서대로 부르면 여섯 응답 시간이 그대로 더해지는데 서로 필요 없는 값이다.
 *
 * 조건이 고정이라 언어당 캐시할 URL 이 여섯 개뿐이다. 상세와 달리 미스가 거의 나지 않는다.
 */
export async function fetchHomeSections(lang: Lang, env: Env, ctx: ExecutionContext) {
  const results = await Promise.all(
    HOME_QUERY_PATHS.map((path) => apiGet<HomeSection>(path, lang, env, ctx)),
  );
  // 홈은 섹션이 비어도 나머지를 그린다. 404 와 장애를 가릴 이유가 없다.
  return results.map((r) => (r.status === 'ok' ? r.data : null));
}
