import { resolveAppEnv } from '@hansapi/common';

/**
 * 단건(by-id) 조회 응답의 Cache-Control.
 *
 * 환경은 부팅 때 한 번 정해지므로 모듈 로드 시 한 번만 계산한다.
 *  - production: 사용자 무관 동일 정보라 공유 캐시(CDN)에 1시간 태운다.
 *  - local/develop: 데이터가 자주 바뀌므로 캐시하지 않는다.
 */
export const DETAIL_CACHE_CONTROL =
  resolveAppEnv() === 'production' ? 'public, max-age=3600' : 'no-store';
