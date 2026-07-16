import i18n from '@/shared/i18n';

/**
 * 서버 LangText({ ko?, en?, ja?, zh? })에서 현재 언어에 맞는 문자열을 고른다.
 * 현재 백엔드는 ko 만 채우지만, 다국어 확장 시 자동으로 반영된다.
 */
export function langText(
  value:
    | { ko?: string; en?: string; ja?: string; zh?: string }
    | undefined
    | null,
): string {
  if (!value) return '';
  // 서버 맵은 짧은 코드(`en`/`zh`)로 온다. URL 로케일(`en-us`/`zh-hans`)을 주 서브태그로
  // 잘라 맞춘다 — `en-us`→`en`, `zh-hans`→`zh`, `ko`/`ja` 는 그대로.
  const lang = i18n.language.split('-')[0] as 'ko' | 'en' | 'ja' | 'zh';
  return value[lang] ?? value.ko ?? value.en ?? value.ja ?? value.zh ?? '';
}
