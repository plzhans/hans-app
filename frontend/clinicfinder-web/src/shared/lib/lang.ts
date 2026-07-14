import i18n from '@/shared/i18n';

/**
 * 서버 LangText({ ko?, en?, ja? })에서 현재 언어에 맞는 문자열을 고른다.
 * 현재 백엔드는 ko 만 채우지만, 다국어 확장 시 자동으로 반영된다.
 */
export function langText(
  value: { ko?: string; en?: string; ja?: string } | undefined | null,
): string {
  if (!value) return '';
  const lang = i18n.language as 'ko' | 'en' | 'ja';
  return value[lang] ?? value.ko ?? value.en ?? value.ja ?? '';
}
