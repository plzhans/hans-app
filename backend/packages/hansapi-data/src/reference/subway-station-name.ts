/**
 * 역명 정규화. **사전을 굽는 쪽과 찾는 쪽이 이 함수를 공유한다.**
 *
 * 파일을 따로 뺀 이유가 그것이다. 생성기(scripts/build-subway-station.ts)가 사전의 키를 이걸로
 * 만들고, 조회하는 쪽도 이걸로 찾는다. 규칙이 두 벌이면 한쪽만 고치는 날 조용히 안 붙는다.
 * (그리고 이 파일은 json 을 import 하지 않는다 — 사전이 없는 상태에서 생성기가 돌아야 하므로)
 *
 * 원본 역명이 세 가지로 흔들린다. 그대로 두면 같은 역이 여러 개가 된다.
 *   '삼송(중부대학교)'   부역명이 괄호로 붙는다
 *   '마두역'             '역' 접미사가 붙기도 하고 안 붙기도 한다
 *   '교대 '              앞뒤 공백·nbsp 가 섞여 있다
 */
export function normalizeStationName(raw: string): string {
  return raw
    .replace(/\u00a0/g, ' ')
    .replace(/[（(].*?[)）]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/역$/, '')
    .trim();
}
