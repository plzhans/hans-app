/**
 * 응답 언어 결정.
 *
 * **서버가 언어를 고른다.** 예전(LangText)에는 `{ ko: "내과", en: "Internal Medicine" }` 처럼
 * 언어맵을 통째로 내려주고 고르는 건 클라이언트 몫이었다. 통합 healthcare API 는 그 방식을 버렸다 —
 * 코드 이름이 붙는 곳이 많아(종별·과목·장비·지역) 응답이 언어 수만큼 부풀고, 클라이언트마다
 * 폴백 규칙을 다시 구현해야 했다. 이제 Accept-Language 로 하나만 골라 평문으로 준다.
 */

/** 지원 언어. 이 목록에 없으면 기본 언어로 떨어진다. */
export const SUPPORTED_LANGS = ['ko', 'en', 'ja'] as const;

export type SupportedLang = (typeof SUPPORTED_LANGS)[number];

/** 번역이 없을 때 돌아갈 언어. 원본 데이터가 한국어라 한국어가 기준이다. */
export const FALLBACK_LANG: SupportedLang = 'ko';

function isSupported(value: string): value is SupportedLang {
  return (SUPPORTED_LANGS as readonly string[]).includes(value);
}

/**
 * Accept-Language 헤더에서 언어를 고른다.
 *
 * 헤더는 `ko`, `en-US`, `ja,en;q=0.9` 처럼 제각각이라 관대하게 읽는다 —
 * 쉼표로 나누고, 앞에서부터 **지원하는 첫 언어**를 택한다. q 가중치는 보지 않는다:
 * 실무에서 브라우저가 주는 순서가 곧 선호 순서이고, 가중치까지 구현하면 얻는 것에 비해 복잡하다.
 *
 * 아무것도 못 고르면 한국어다. **모르면 한국어**가 맞다 — 원본이 한국어라 번역이 없어도
 * 값이 비지 않는다.
 */
export function resolveLang(header?: string | null): SupportedLang {
  if (!header) {
    return FALLBACK_LANG;
  }

  for (const part of header.split(',')) {
    // "en-US;q=0.9" → "en"
    const tag = part.split(';')[0]?.trim().toLowerCase().split('-')[0];
    if (tag && isSupported(tag)) {
      return tag;
    }
  }

  return FALLBACK_LANG;
}

/**
 * 시드(코드 파일)에 손으로 적는 다국어 이름.
 *
 * DB 코드 테이블(healthcare_code·region_code)이 아니라 **TS 시드에만 있는 이름**에 쓴다 —
 * 병원 등급, 진료 분야 그룹처럼 우리가 만든 분류라 DB 에 넣지 않은 것들이다.
 * 한국어는 필수다. 원본이 한국어라 기준이자 폴백이 된다.
 */
export interface LangName {
  ko: string;
  en?: string;
  ja?: string;
}

/** 다국어 이름에서 언어를 고른다. 번역이 없으면 한국어. */
export function pickLangName(name: LangName, lang: SupportedLang): string {
  return name[lang] || name.ko;
}
