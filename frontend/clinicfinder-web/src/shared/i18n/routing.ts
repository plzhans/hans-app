import { useTranslation } from 'react-i18next';
import {
  DEFAULT_LANGUAGE,
  isSupportedLanguage,
  type SupportedLanguage,
} from '@/shared/i18n';

/**
 * 언어 접두사 규칙. **한 곳에만 둔다** — 링크·스위처·라우터가 제각각 문자열을 이어 붙이면
 * 반드시 어긋난다(`/en//search` 같은 것이 나온다).
 *
 *   ko  →  /search        (기본 언어는 접두사가 없다)
 *   en  →  /en/search
 *   ja  →  /ja/search
 *
 * **기본 언어에 접두사를 안 붙이는 이유:** 국내 서비스라 한국어가 절대다수인데 `/ko/` 를
 * 붙이면 모든 URL 이 길어지고 리다이렉트가 한 번 더 생긴다. 대신 `/ko/...` 로 들어오면
 * 접두사를 떼어 리다이렉트한다 — 같은 내용이 두 URL 에 있으면 중복 콘텐츠가 된다.
 */
export function langPath(path: string, lang: SupportedLanguage): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  return lang === DEFAULT_LANGUAGE ? clean : `/${lang}${clean}`;
}

/** 경로에서 언어 접두사를 떼어낸다. `/en/search` → `/search` */
export function stripLang(pathname: string): string {
  const [, first, ...rest] = pathname.split('/');
  if (isSupportedLanguage(first)) {
    return `/${rest.join('/')}`;
  }
  return pathname;
}

/** 지금 언어를 붙여 주는 링크 경로 생성기. `to={path('/search')}` */
export function useLangPath() {
  const { i18n } = useTranslation();
  const lang = isSupportedLanguage(i18n.language)
    ? i18n.language
    : DEFAULT_LANGUAGE;

  return (path: string) => langPath(path, lang);
}
