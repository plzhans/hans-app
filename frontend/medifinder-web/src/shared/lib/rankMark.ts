/**
 * 순위 표식 — 색과 글자.
 *
 * **지도 핀과 목록 카드가 같이 쓴다.** 지도의 ③과 목록의 ③이 같은 색이어야 서로 찾히는데,
 * 두 곳에 색을 따로 적으면 반드시 어긋난다. 그래서 한 곳에 둔다.
 *
 * 지도 어댑터(mapAdapters)에 두지 않은 이유는 **카드가 지도를 안 쓰기 때문이다** —
 * 거기서 가져오면 검색·홈 화면 번들에 지도 SDK 글루가 통째로 끌려온다(실측 3.9 → 12.3 kB).
 */

/**
 * 순위 하나의 색 한 벌. **지도와 카드가 세기를 달리 쓴다.**
 *
 *   지도  solid + 흰 글자 — 지도 타일 위에서 눈에 띄어야 한다. 거기선 이 표식이 주인공이다.
 *   카드  tint + ink 글자 — 카드는 등급·전문병원·과목 배지가 이미 붙어 있어서,
 *         같은 세기로 칠하면 순위가 나머지를 다 눌러버린다.
 *
 * 같은 색상군이라 세기가 달라도 A 는 A 로 이어진다.
 */
export interface RankMark {
  /** 지도 핀 채움. 흰 글자를 얹는다. */
  solid: string;
  /** 카드 배지 배경(같은 색 8% + 흰색 92%). */
  tint: string;
  /** 카드 배지 글자. tint 위에서 4.5:1 이상. */
  ink: string;
}

/**
 * 다섯 순위의 색.
 *
 * **눈으로 고른 색이 아니다.** 지도 마커는 아무 둘이나 나란히 놓일 수 있어(all-pairs)
 * 통과하는 조합이 드물다. tailwind 팔레트에서 흰 글자 대비 4.5:1 이상인 43개를 뽑아
 * 5색 조합을 전수로 돌린 결과 420개만 통과했고, 그중 브랜드 파랑을 포함한 최선이 solid 다:
 *
 *   적록색약 최악쌍 ΔE 8.1 (목표 8 이상) · 정상시야 최악쌍 ΔE 19.0 (하한 15)
 *   흰 글자 대비 최소 4.6:1 · 배경 대비 전부 3:1 이상
 *
 * **다섯을 서로 다른 색상군에서 뽑는 건 안 된다** — 파랑·초록·분홍·주황·보라에서 하나씩
 * 고르는 조합을 전수로 돌리면 통과가 0개다. 색만으로 다섯을 가르는 건 원래 빡빡한 문제라,
 * 실제 식별은 글자(A~E)가 하고 색은 거드는 역할이다.
 *
 * 바꾸려면 눈대중 말고 dataviz 스킬의 validate_palette.js 를 `--pairs all` 로 다시 돌려라.
 * ink 는 제 tint 위에서 4.5:1 을 넘겨야 한다(파랑·분홍은 그래서 solid 보다 한 단계 진하다).
 */
export const RANK_MARKS: readonly RankMark[] = [
  // A 파랑 blue     solid 600 / ink 700      대비 6.02:1
  { solid: '#2563EB', tint: '#EEF3FD', ink: '#1D4ED8' },
  // B 초록 emerald  solid·ink 700            대비 4.90:1
  { solid: '#047857', tint: '#EBF4F2', ink: '#047857' },
  // C 분홍 pink     solid 600 / ink 700      대비 5.37:1
  { solid: '#DB2777', tint: '#FCEEF4', ink: '#BE185D' },
  // D 갈색 amber    solid·ink 800            대비 6.28:1
  { solid: '#92400E', tint: '#F6F0EC', ink: '#92400E' },
  // E 자주 fuchsia  solid·ink 800            대비 7.19:1
  { solid: '#86198F', tint: '#F5EDF6', ink: '#86198F' },
];

/** 순위에 해당하는 색 한 벌. 목록이 다섯을 넘어가면 앞에서부터 돌려 쓴다. */
export function rankMark(rank: number): RankMark {
  return RANK_MARKS[(rank - 1) % RANK_MARKS.length];
}

const RANK_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * 순위에 해당하는 글자. **1,2,3 이 아니라 A,B,C 다.**
 *
 * 이 앱에서 색 배지 안의 **숫자는 이미 지하철 노선**이다(LineBadge — 색이 식별자고 숫자가
 * 노선 번호다). 근처 카드는 역 배지도 함께 켜므로, 순위까지 숫자로 달면 한 카드에
 * "2번 병원" 과 "2호선" 이 나란히 떠 서로 구분되지 않는다.
 *
 * 알파벳은 그 충돌이 원천적으로 없다 — 한국 지하철 노선에 알파벳 표기가 없기 때문이다.
 * 순서를 읽는 데도 지장이 없다(A 다음이 B 라는 건 설명이 필요 없다).
 */
export function rankLabel(rank: number): string {
  return RANK_LETTERS[(rank - 1) % RANK_LETTERS.length];
}
