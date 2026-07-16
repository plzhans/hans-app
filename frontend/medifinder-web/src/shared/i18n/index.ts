import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ko from './locales/ko.json';
import enUs from './locales/en-us.json';
import ja from './locales/ja.json';
import zhHans from './locales/zh-hans.json';

/**
 * URL 접두사이자 i18next 언어 코드. **BCP-47 로 정확히 명시한다.**
 *
 * 예전엔 `en`·`zh` 였다. `zh` 는 간체/번체가 안 갈리고 `en` 도 지역이 모호해서,
 * 실제로 구분이 필요한 언어에만 서브태그를 붙였다 — 영어는 지역(`-us`), 중국어는
 * 스크립트(`-hans`). `ja`·`ko` 는 경쟁 변형이 없어 그대로 둔다.
 *
 * **백엔드는 이 값을 몰라도 된다.** 서버 `resolveLang` 이 `Accept-Language` 를
 * 주 서브태그로 잘라 매칭하므로(`en-us`→`en`, `zh-hans`→`zh`), DB·응답은 짧은 코드를
 * 그대로 쓴다. 서버 응답 맵(`{ko,en,ja,zh}`)을 인덱싱할 땐 shared/lib/lang.ts 가 다시 자른다.
 */
export const SUPPORTED_LANGUAGES = ['ko', 'en-us', 'ja', 'zh-hans'] as const;
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
 * 사람마다 다른 언어를 보여준다 — 검색엔진에는 재앙이다. 크롤러가 `/en-us/hospitals/1` 을
 * 긁었는데 한국어가 나오거나, 공유한 링크가 받는 사람 브라우저 언어로 바뀐다.
 *
 * 이제 언어는 경로 접두사로만 정해진다(`/en-us/...`). 감지기를 빼고 라우트(LangLayout)가
 * changeLanguage 를 부른다. 초기값은 기본 언어로 두고, 라우트가 곧바로 덮어쓴다.
 */
void i18n.use(initReactI18next).init({
  resources: {
    ko: { translation: ko },
    'en-us': { translation: enUs },
    ja: { translation: ja },
    'zh-hans': { translation: zhHans },
  },
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: SUPPORTED_LANGUAGES,
  interpolation: { escapeValue: false },
});

export default i18n;
