import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ko from './locales/ko.json';
import en from './locales/en.json';
import ja from './locales/ja.json';

export const SUPPORTED_LANGUAGES = ['ko', 'en', 'ja'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/** 접두사 없는 URL(`/search`)의 언어. 한국 서비스라 한국어가 기본이다. */
export const DEFAULT_LANGUAGE: SupportedLanguage = 'ko';

export function isSupportedLanguage(value?: string): value is SupportedLanguage {
  return SUPPORTED_LANGUAGES.includes(value as SupportedLanguage);
}

/**
 * **URL 이 언어의 단일 진실 공급원이다.**
 *
 * 예전엔 LanguageDetector(localStorage + navigator)가 언어를 정했다. 그러면 같은 URL 이
 * 사람마다 다른 언어를 보여준다 — 검색엔진에는 재앙이다. 크롤러가 `/en/hospitals/1` 을
 * 긁었는데 한국어가 나오거나, 공유한 링크가 받는 사람 브라우저 언어로 바뀐다.
 *
 * 이제 언어는 경로 접두사로만 정해진다(`/en/...`). 감지기를 빼고 라우트(LangLayout)가
 * changeLanguage 를 부른다. 초기값은 기본 언어로 두고, 라우트가 곧바로 덮어쓴다.
 */
void i18n.use(initReactI18next).init({
  resources: {
    ko: { translation: ko },
    en: { translation: en },
    ja: { translation: ja },
  },
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: SUPPORTED_LANGUAGES,
  interpolation: { escapeValue: false },
});

export default i18n;
