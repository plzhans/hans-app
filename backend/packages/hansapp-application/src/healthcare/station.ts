/** "전철역", "지하철역" 은 역 이름이 아니다. 앞 단어가 진짜 이름이다. */
const GENERIC_STATION = ['전철역', '지하철역', '역'];

/**
 * 하차지점에서 역 이름만 뽑는다. "망미역4번출구" → "망미역"
 *
 * 원본이 하차지점을 자유 텍스트로 준다. 두 가지 함정이 있다.
 *   "동래 전철역 1번 출구"  → 그냥 뽑으면 "전철역" 이 나온다. 앞 단어를 붙여 "동래역" 으로 만든다.
 *   "2번출구", "지하상가11번출구" → 역 이름이 아예 없다. 출구 번호만으로는 어느 역인지 알 수 없어 버린다.
 */
export function stationName(arrival: string | null): string | null {
  if (!arrival) {
    return null;
  }

  const match = /([가-힣A-Za-z0-9]+역)/.exec(arrival);
  if (!match) {
    return null;
  }

  const name = match[1];
  if (!GENERIC_STATION.includes(name)) {
    return name;
  }

  // "동래 전철역" — 일반명사 앞의 단어가 진짜 역 이름이다.
  const before = arrival.slice(0, match.index).trim().split(/\s+/).pop();
  return before ? `${before}역` : null;
}
