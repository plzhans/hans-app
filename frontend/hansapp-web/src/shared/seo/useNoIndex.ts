import { useEffect } from 'react';

/**
 * 이 화면이 떠 있는 동안 검색 색인에서 뺀다.
 *
 * **robots.txt 로 막지 않는다.** Disallow 는 크롤러를 문 앞에서 돌려보내는 것이라 안에 있는
 * noindex 를 영영 못 읽는다. 그러면 다른 곳에 링크된 주소는 내용 없이 URL 만 검색 결과에 남는다
 * — 약관은 가입 화면이 링크하므로 정확히 그 경우다. 들여보내되 색인만 하지 말라고 해야 지워진다.
 *
 * SPA 라 화면마다 HTML 이 따로 없고 index.html 의 meta 한 개를 모두가 공유한다. 그래서 값을
 * 바꿔 쓰고 나갈 때 되돌린다 — 안 되돌리면 약관을 거쳐 간 세션에서는 이후 모든 화면이 noindex 다.
 */
export function useNoIndex() {
  useEffect(() => {
    const tag = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!tag) return;

    const previous = tag.content;
    // follow 는 남긴다. 이 문서를 색인하지 말라는 것이지, 여기 걸린 링크까지 끊을 이유는 없다.
    tag.content = 'noindex, follow';
    return () => {
      tag.content = previous;
    };
  }, []);
}
