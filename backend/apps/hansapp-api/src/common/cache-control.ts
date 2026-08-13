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

/**
 * 게시판 목록의 Cache-Control. **1분.**
 *
 * **누구에게나 같은 응답이다** — 인자도 없고 로그인도 보지 않으며, 공개된 게시판만 담긴다.
 * 포털은 화면을 열 때마다 이걸 부르므로(메뉴·제목이 여기서 나온다) 방문 한 번에 여러 번
 * 닿는데, 정작 내용은 운영자가 게시판을 만들거나 고칠 때만 바뀐다.
 *
 * 글 상세와 같은 1분인 것은 **지울 방법이 없기 때문이다.** 공유 캐시에 나간 응답은 서버가
 * 회수하지 못해, 게시판을 새로 만들면 그 시간만큼 포털 메뉴에 늦게 뜬다 — 1분이면 운영자가
 * 이상하다고 느끼기 전에 맞춰진다.
 */
export const BOARD_LIST_CACHE_CONTROL =
  resolveAppEnv() === 'production' ? 'public, max-age=60' : 'no-store';

/**
 * 게시글 목록 **첫 페이지**의 Cache-Control. 1분.
 *
 * **첫 화면만 태운다**(→ BoardController.listPosts). 게시판을 열면 누구나 같은 첫 페이지를
 * 보게 되는데, 링크가 퍼질 때 몰리는 것도 그 한 장이다 — 2페이지부터는 사람마다 가는 곳이
 * 갈려 캐시가 잘 맞지도 않고, 조합마다 다른 응답을 공유 캐시에 쌓아 둘 이유도 없다.
 *
 * 글이 올라오면 최대 1분 늦게 목록에 뜬다. 글 상세와 같은 값이라 "쓴 글이 언제 보이나" 가
 * 화면마다 다르지 않다.
 */
export const BOARD_POST_LIST_CACHE_CONTROL =
  resolveAppEnv() === 'production' ? 'public, max-age=60' : 'no-store';
