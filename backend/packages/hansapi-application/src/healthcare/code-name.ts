import type { SupportedLang } from '@hansapi/common';

/**
 * 코드 이름을 언어에 맞춰 고른다.
 *
 * **SQL 로 고르지 않는다.** `COALESCE(c.nm_en, c.nm)` 같은 컬럼식을 동적으로 만들어
 * Prisma.sql 에 끼워 넣었더니, 그 조각이 평탄화되지 않고 **바인딩 값으로** 들어가
 * 응답에 SQL 객체가 그대로 나왔다. 이제 nm/nm_en/nm_ja 를 셋 다 SELECT 해서 여기서 고른다 —
 * 컬럼 두 개가 더 붙을 뿐이고, 동적 SQL 이 사라져 주입 여지도 없다.
 *
 * **빈 문자열도 폴백 대상이다.** `||` 를 쓰는 이유다 — 번역 칸을 실수로 빈 문자열로 채우면
 * `??` 는 그 빈칸을 그대로 내보내 화면이 비어 버린다. 한국어라도 보이는 편이 낫다.
 */
export function pickName(
  row: { nm: string; nm_en?: string | null; nm_ja?: string | null },
  lang: SupportedLang,
): string {
  if (lang === 'en') return row.nm_en || row.nm;
  if (lang === 'ja') return row.nm_ja || row.nm;
  return row.nm;
}
