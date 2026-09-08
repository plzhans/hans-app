/**
 * 경로와 언어. **화면의 shared/i18n/routing 과 같은 규칙이다** — 규칙이 갈리면
 * 워커가 만든 canonical 과 화면이 만든 canonical 이 서로 다른 주소를 가리키게 된다.
 */

export const LANGS = ['ko', 'en-us', 'ja', 'zh-hans'] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = 'ko';

/** `/en-us/hospitals/1` → `{ lang: 'en-us', path: '/hospitals/1' }` */
export function splitLang(pathname: string): { lang: Lang; path: string } {
  for (const lang of LANGS) {
    if (lang === DEFAULT_LANG) continue;
    if (pathname === `/${lang}` || pathname.startsWith(`/${lang}/`)) {
      return { lang, path: pathname.slice(lang.length + 1) || '/' };
    }
  }
  return { lang: DEFAULT_LANG, path: pathname };
}

/** 기본 언어는 접두사가 없다. `/search` 지 `/ko/search` 가 아니다. */
export function langPath(path: string, lang: Lang) {
  return lang === DEFAULT_LANG ? path : `/${lang}${path === '/' ? '/' : path}`;
}
