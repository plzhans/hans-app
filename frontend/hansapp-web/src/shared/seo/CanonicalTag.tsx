import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import { SITE_URL } from '@/shared/config/env';

/**
 * 지금 보고 있는 화면의 정본 주소를 선언한다(`<link rel="canonical">` · `og:url`).
 *
 * **SPA 라 화면마다 HTML 이 따로 없다.** index.html 한 장을 모든 라우트가 공유하고, 거기
 * 박힌 canonical 은 홈(`/`)이다. 그대로 두면 `/board/notice/12` 도 "내 정본은 홈" 이라고
 * 말하는 셈이라, 검색엔진이 홈의 중복으로 보고 합쳐 버린다 — 사이트맵에 실어도 색인되지 않는다.
 *
 * **주인을 하나로 둔다.** 화면마다 훅을 부르지 않고 라우터 바로 아래에서 모든 이동에 대해
 * 값을 덮어쓴다. 화면별로 세우면 값을 되돌릴 책임이 생기고, 되돌릴 기준값이 문서마다 달라
 * (구운 라우트는 자기 주소, 폴백은 홈) 조용히 어긋난다.
 *
 * 구운 라우트(vite/seo-assets.ts 의 /terms/*)와도 싸우지 않는다. 그쪽은 HTML 에 이미 자기
 * 주소가 박혀 있고, 여기서 계산하는 값도 같은 주소라 결과가 같다. 크롤러는 HTML 을 보고,
 * 사람이 SPA 안에서 이동할 때는 이쪽이 맞춰 준다.
 *
 * **쿼리스트링은 뺀다.** 지금 이 앱에서 쿼리는 화면 상태가 아니고(게시판 페이지 번호도
 * useState 다), 붙이면 같은 문서가 주소마다 다른 정본을 갖게 된다.
 */
export function CanonicalTag() {
  const { pathname } = useLocation();

  useEffect(() => {
    // 주소를 모르면 손대지 않는다. 상대경로 canonical 은 "내가 곧 정본" 이라는 뜻이라,
    // 아무 말도 안 하는 것보다 나쁘다.
    if (!SITE_URL) return;

    const href = `${SITE_URL}${pathname}`;
    setAttribute('link[rel="canonical"]', 'href', href);
    setAttribute('meta[property="og:url"]', 'content', href);
  }, [pathname]);

  return null;
}

/** 이미 있는 태그의 값만 바꾼다. index.html 이 둘 다 갖고 있으므로 새로 만들지 않는다. */
function setAttribute(selector: string, attribute: string, value: string) {
  document.querySelector(selector)?.setAttribute(attribute, value);
}
