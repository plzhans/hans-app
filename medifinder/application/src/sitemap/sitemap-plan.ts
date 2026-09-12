/**
 * 사이트맵을 어떻게 자를지.
 *
 * 자르는 이유는 규격이다 — 파일 하나에 URL 50,000개·50MB 를 넘길 수 없다.
 * 의원급만 77,000곳이라 한국어만으로도 이미 한 파일에 안 들어간다.
 *
 * tier 와 언어 둘 다로 가른다. 둘 중 하나만 쓰면 어차피 상한에 걸려 번호를 붙여야 하고,
 * 둘 다 쓰면 Search Console 이 파일 단위로 색인 현황을 보여주므로
 * "일본어가 통째로 안 잡힌다" 와 "의원급이 안 잡힌다" 를 따로 볼 수 있다.
 */

/** URL 접두사. 기본 언어는 접두사가 없다(프론트 shared/i18n 과 같은 규칙). */
export const LANGS = ['ko', 'en-us', 'ja', 'zh-hans'] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = 'ko';

/** 병원 등급. 응답의 tier.code 값이다. */
export const TIERS = ['TIER3', 'TIER2', 'TIER1', 'NURSING', 'MENTAL'] as const;
export type Tier = (typeof TIERS)[number];

/**
 * 한 파일에 담을 URL 수. 규격 상한은 50,000 이고 여유를 둔다.
 * 상한에 딱 맞추면 항목 하나만 늘어도 파일이 하나 더 생겨 인덱스가 흔들린다.
 */
export const URLS_PER_FILE = 45_000;

/**
 * tier 마다 어느 언어를 낼지.
 *
 * **의원급만 한국어다. 가르는 기준은 분량이다.**
 *
 * 번역이 아직 기계번역 잠정값인데 의원은 7만 곳이라, 네 언어로 내면 품질이 낮은 문서
 * 31만 개를 한꺼번에 내미는 셈이 된다. 나머지 등급은 다 합쳐도 4,600곳이라 같은 걱정이
 * 성립하지 않는다 — 그리고 프론트는 등급으로 언어를 막지 않으므로, 빼면 **실재하는
 * 페이지를 사이트맵에서만 감추는** 꼴이 된다.
 *
 * 의원급까지 다국어로 돌리려면 TIER1 을 LANGS 로 바꾼다. 그 외에 고칠 곳은 없다.
 */
export const LANGS_BY_TIER: Record<Tier, readonly Lang[]> = {
  TIER3: LANGS,
  TIER2: LANGS,
  TIER1: [DEFAULT_LANG],
  NURSING: LANGS,
  MENTAL: LANGS,
};

/**
 * 병원 말고 사이트맵에 넣을 페이지.
 *
 * **API 로는 알 수 없어서 여기 적는다.** 정적 화면이라 목록이 거의 안 바뀐다.
 *
 * `/search` 는 일부러 뺐다. 구글은 사이트 내부 검색 결과의 색인을 권하지 않고(조건 조합마다
 * URL 이 생기고 내용이 겹친다), 워커가 서버 렌더하는 것도 홈과 병원 상세뿐이라 크롤러가
 * 받는 것은 제목·설명뿐인 껍데기다. 홈에서 링크로 닿으므로 발견되지 않는 것도 아니다.
 *
 * `/terms/*` 도 뺀다 — robots.txt 가 막고 noindex 도 붙는다. 사이트맵에 넣으면 말이 어긋난다.
 */
export const STATIC_PATHS: readonly string[] = ['/'];

/** 정적 페이지 사이트맵의 파일 이름. */
export const STATIC_FILE = 'sitemap-static.xml';

/** `/hospitals/1` → `/ja/hospitals/1`. 기본 언어는 접두사가 없다. */
export function langPath(path: string, lang: Lang): string {
  return lang === DEFAULT_LANG ? path : `/${lang}${path}`;
}

/**
 * 파일 이름. tier 를 앞에 둔다 — 인덱스에서 정렬하면 상급종합이 위로 모여
 * 중요한 것부터 눈에 들어온다. 조각이 하나뿐이면 번호를 붙이지 않는다.
 */
export function fileName(tier: Tier, lang: Lang, part: number, total: number): string {
  const suffix = total > 1 ? `-${part}` : '';
  return `sitemap-${tier.toLowerCase()}-${lang}${suffix}.xml`;
}
