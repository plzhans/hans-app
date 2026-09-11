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
 * 의원급을 한국어만 내는 것은 번역이 아직 잠정값(기계번역)이라서다. 동네 의원 7만 곳을
 * 네 언어로 제출하면 품질이 낮은 문서를 대량으로 내미는 셈이 된다.
 * 외국인이 찾는 것은 상급종합·병원급이라 그쪽만 네 언어로 낸다.
 *
 * 요양·정신병원도 한국어만 낸다. 장기 입원 시설이라 찾는 사람이 보호자·환자 본인이고,
 * 외국어로 들어오는 수요가 사실상 없다.
 *
 * 전량 다국어로 돌리려면 아래를 전부 LANGS 로 바꾸면 된다. 그 외에 고칠 곳은 없다.
 */
export const LANGS_BY_TIER: Record<Tier, readonly Lang[]> = {
  TIER3: LANGS,
  TIER2: LANGS,
  TIER1: [DEFAULT_LANG],
  NURSING: [DEFAULT_LANG],
  MENTAL: [DEFAULT_LANG],
};

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
