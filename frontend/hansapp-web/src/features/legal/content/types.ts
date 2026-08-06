/**
 * 약관·방침 문서(*.json)의 모양.
 *
 * **JSX 가 아니라 데이터로 둔다.** 조문은 언어마다 통째로 다시 쓰는 글이고 개정도 조 단위로
 * 일어난다 — 마크업에 섞어 두면 번역본을 맞출 때 태그까지 같이 옮겨야 하고, 한쪽만 고쳐
 * 조 번호가 어긋나도 알아채기 어렵다. 언어별 파일이 같은 구조를 채우므로 조가 빠지면 눈에 띈다.
 *
 * **화면 문구를 담는 i18n JSON(shared/i18n/locales)과는 다른 자리다.** 조문은 문서 한 벌이
 * 통째로 의미를 가지는데, 그걸 키·값으로 흩어 두면 순서와 번호를 사람이 관리하게 된다.
 * 그래서 문서마다 파일 하나이고, 파일을 그대로 밖에 건넬 수 있다.
 */

/**
 * 조문 한 덩어리.
 * · 문자열      — 문단 하나
 * · { list }    — 항·호의 나열. 번호는 글 안에 직접 적는다(①, 1. …). 자동 번호를 붙이면
 *                 조문끼리 번호 체계가 달라지는 것을 표현할 수 없다.
 * · { table }   — 국외이전 고지처럼 항목·국가·기간을 나란히 밝혀야 하는 자리.
 */
export type LegalBlock =
  | string
  | { list: string[] }
  | { table: { head: string[]; rows: string[][] } };

export interface LegalSection {
  /** "제1조 (목적)" 처럼 번호까지 포함한 제목. */
  heading: string;
  blocks: LegalBlock[];
}

export interface LegalDoc {
  title: string;
  /** "시행일: 2026년 8월 5일" — 개정 이력을 따지는 기준이라 본문 맨 위에 둔다. */
  effective: string;
  /** 조문 앞의 총칙 성격 문단. */
  intro: string[];
  sections: LegalSection[];
}
