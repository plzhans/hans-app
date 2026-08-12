import { resolveAppEnv } from '@hansapp/common';

/**
 * 단건(by-id) 조회 응답의 Cache-Control.
 *
 * 환경은 부팅 때 한 번 정해지므로 모듈 로드 시 한 번만 계산한다.
 *  - production: 사용자 무관 동일 정보라 공유 캐시(CDN)에 1시간 태운다.
 *  - local/develop: 데이터가 자주 바뀌므로 캐시하지 않는다.
 */
export const DETAIL_CACHE_CONTROL =
  resolveAppEnv() === 'production' ? 'public, max-age=3600' : 'no-store';

/**
 * 게시판 글 상세의 Cache-Control. **1분.**
 *
 * **오래 태우려는 것이 아니라 순간 트래픽을 받아 내려는 값이다.** 공지 하나가 링크를 타고
 * 퍼질 때 같은 글 요청이 한꺼번에 몰리는데, 1분이면 그 봉우리를 CDN 이 대신 받는다.
 * 대신 고친 글이 반영되는 데 최대 1분이 걸린다 — 그 이상 늘리면 "고쳤는데 안 바뀐다" 가
 * 눈에 띄기 시작한다.
 *
 * **붙이는 것은 공개 글뿐이다**(→ BoardController.getPost). 비공개 글은 보는 사람에 따라
 * 본문이 갈리므로 공유 캐시에 남기면 남의 글이 옆 사람에게 나간다.
 */
export const BOARD_POST_CACHE_CONTROL =
  resolveAppEnv() === 'production' ? 'public, max-age=60' : 'no-store';
