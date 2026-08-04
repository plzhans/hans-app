import type { SupportedLang } from '@hansapp/common';

/**
 * 코드 이름을 언어에 맞춰 고른다.
 *
 * **SQL 로 고르지 않는다.** `COALESCE(c.nm_en, c.nm)` 같은 컬럼식을 동적으로 만들어
 * Prisma.sql 에 끼워 넣었더니, 그 조각이 평탄화되지 않고 **바인딩 값으로** 들어가
 * 응답에 SQL 객체가 그대로 나왔다. 이제 nm/nm_en/nm_ja 를 셋 다 SELECT 해서 여기서 고른다 —
 * 컬럼 두 개가 더 붙을 뿐이고, 동적 SQL 이 사라져 주입 여지도 없다.
 *
 * **빈 문자열도 폴백 대상이다.** `||` 를 쓰는 이유다 — 번역 칸을 실수로 빈 문자열로 채우면
 * `??` 는 그 빈칸을 그대로 내보내 화면이 비어 버린다. 아무거나 보이는 편이 낫다.
 *
 * **일본어·중국어는 한국어로 곧장 물러나지 않고 영어를 거친다.** 두 언어권 사용자는 한글을
 * 읽지 못하지만 로마자는 읽는다 — "경기도" 보다 "Gyeonggi-do" 가 쓸모 있다. 지명에서 특히
 * 그런데, 지명은 정부 공식 로마자 표기가 있어 영어만큼은 정본을 채울 수 있기 때문이다.
 * (영어 자신은 거칠 곳이 없어 바로 한국어로 간다.)
 */
export function pickName(
  row: {
    nm: string;
    nm_en?: string | null;
    nm_ja?: string | null;
    nm_zh?: string | null;
  },
  lang: SupportedLang,
): string {
  if (lang === 'en') return row.nm_en || row.nm;
  if (lang === 'ja') return row.nm_ja || row.nm_en || row.nm;
  if (lang === 'zh') return row.nm_zh || row.nm_en || row.nm;
  return row.nm;
}
