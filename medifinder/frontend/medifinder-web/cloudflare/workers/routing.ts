/**
 * 경로와 언어. 화면의 shared/i18n/routing 과 같은 규칙을 쓴다.
 * 갈리면 워커가 만든 canonical 과 화면이 만든 canonical 이 서로 다른 주소를 가리킨다.
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

/**
 * 이 앱이 실제로 가진 경로. 언어 접두사를 떼어 낸 뒤의 모양이다.
 *
 * 여기 없는 경로는 404 다. SPA 폴백이 전부 200 을 주던 때는 없는 병원 ID 도, 오타 난
 * 주소도 색인 대상으로 잡혔다.
 */
export type Route =
  | { kind: 'home' }
  | { kind: 'search' }
  | { kind: 'account' }
  | { kind: 'callback' }
  | { kind: 'terms' }
  | { kind: 'hospital'; id: string; npay: boolean }
  | { kind: 'unknown' };

const TERMS_PATHS = ['/terms', '/terms/service', '/terms/location', '/terms/privacy', '/privacy'];

export function matchRoute(path: string): Route {
  if (path === '/') return { kind: 'home' };
  if (path === '/search') return { kind: 'search' };
  if (path === '/me') return { kind: 'account' };
  if (path === '/auth/callback') return { kind: 'callback' };
  if (TERMS_PATHS.includes(path)) return { kind: 'terms' };

  const hospital = /^\/hospitals\/(\d+)(\/npay)?$/.exec(path);
  if (hospital) return { kind: 'hospital', id: hospital[1], npay: !!hospital[2] };

  return { kind: 'unknown' };
}

/**
 * 이 URL 의 정본 경로. 요청 경로가 이것과 다르면 301 로 보낸다.
 *
 * 셋을 정리한다.
 *   `/hospitals/1/` → `/hospitals/1`   끝 슬래시
 *   `/en-us`        → `/en-us/`        언어 루트는 슬래시가 있는 쪽이 정본이다
 *   `/ko/search`    → `/search`        기본 언어는 접두사를 쓰지 않는다
 *
 * 끝 슬래시를 떼기 전에는 같은 문서가 두 주소로 색인됐다. 둘 다 200 이고 각자 자기
 * 자신을 canonical 로 가리켜서, 병원 페이지마다 중복 쌍이 하나씩 생겼다.
 */
export function canonicalPath(pathname: string): string {
  // 기본 언어 접두사는 주소에 쓰지 않는다.
  let raw = pathname;
  if (raw === `/${DEFAULT_LANG}` || raw.startsWith(`/${DEFAULT_LANG}/`)) {
    raw = raw.slice(DEFAULT_LANG.length + 1) || '/';
  }

  const { lang, path } = splitLang(raw);
  const stripped = path.length > 1 && path.endsWith('/') ? path.replace(/\/+$/, '') : path;
  return langPath(stripped || '/', lang);
}
