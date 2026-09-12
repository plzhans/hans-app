import { useEffect, useState } from 'react';

/** Tailwind 의 lg. 여기와 CSS 가 같은 숫자를 봐야 화면과 코드가 안 어긋난다. */
const WIDE_QUERY = '(min-width: 1024px)';

/**
 * 넓은 화면인가.
 *
 * **CSS 의 `lg:` 로 해결되는 일에는 쓰지 않는다.** 보이고 안 보이고, 색·간격이 달라지는 정도는
 * 클래스로 충분하고 그 편이 렌더를 안 태운다. 이 훅은 **화면 폭이 동작을 바꿀 때**를 위한 것이다:
 *
 *   - 상세 앱바 — 배경·글자색·아이콘 색이 한 벌로 같이 바뀐다. `lg:` 변형으로 흩어 놓으면
 *     한 줄만 밀려도 흰 바탕에 흰 아이콘 같은 조합이 조용히 만들어진다(실제로 냈던 버그다).
 *   - 검색 상세검색 — 처음에 펼칠지 접을지는 상태(useState)라 CSS 로 정할 수 없다.
 */
export function useIsWide(): boolean {
  const [wide, setWide] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(WIDE_QUERY).matches,
  );

  useEffect(() => {
    const query = window.matchMedia(WIDE_QUERY);
    const onChange = () => setWide(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return wide;
}
