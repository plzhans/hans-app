import type { TFunction } from 'i18next';
import type { SupportedLanguage } from '@/shared/i18n';

/**
 * 문서를 그 화면의 언어로 못 주는 경우의 안내.
 *
 * · 한국어  — 정본이다. 안내가 필요 없다.
 * · 영어    — 사람이 옮긴 번역본이고, "정본은 한국어" 라는 말은 본문 머리말에 이미 들어 있다.
 * · 그 외   — 그 언어 번역본이 없어 영어본을 보여주는 상태라, 그 사실을 화면 언어로 알린다.
 */
export function translationNotice(
  lang: SupportedLanguage,
  t: TFunction,
): string | undefined {
  if (lang === 'ko' || lang === 'en-us') return undefined;
  return t('legal.englishOnly');
}
