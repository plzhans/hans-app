import { apiGet } from './api';
import type { Env } from './env';
import type { Lang } from './routing';
import type {
  HospitalDetailDto,
  HospitalNearbyResponseDto,
  TransportRouteDto,
} from '../../src/shared/api/generated/model';

/** 병원 상세 화면이 서버에서 그려질 때 필요한 조회. */

/**
 * 화면과 같은 타입을 쓴다. 생성된 DTO 라 서버 스펙이 바뀌면 `pnpm api:sync` 한 번에 따라온다.
 * import type 이라 번들에는 아무것도 들어가지 않는다.
 */
export type Hospital = HospitalDetailDto;
export type Nearby = HospitalNearbyResponseDto;
export type TransportRoute = TransportRouteDto;

/** GET /healthcare/hospitals/{id} */
export function fetchHospital(id: string, lang: Lang, env: Env, ctx: ExecutionContext) {
  return apiGet<Hospital>(`/healthcare/hospitals/${id}`, lang, env, ctx);
}

/**
 * GET /healthcare/hospitals/{id}/nearby — 근처의 비슷한 병원.
 *
 * 상세 응답에 없는 별개 호출이다. 반경이 기준 병원의 등급에 따라 달라서 조회 맥락에서
 * 계산되는 값이기 때문이다. 그래도 서버에서 받아 오는 것은, 여기서 나오는 병원 링크 여섯 개가
 * 상세끼리를 잇는 유일한 통로라서다. 없으면 크롤러에게 8만 개 상세가 서로 끊긴 섬이다.
 *
 * size 는 화면이 정한 값을 받아 쓴다. 어긋나면 react-query 키가 달라져서 브라우저가
 * 조용히 같은 것을 다시 부른다.
 */
export function fetchNearby(
  id: string,
  size: number,
  lang: Lang,
  env: Env,
  ctx: ExecutionContext,
) {
  return apiGet<Nearby>(`/healthcare/hospitals/${id}/nearby?size=${size}`, lang, env, ctx);
}
