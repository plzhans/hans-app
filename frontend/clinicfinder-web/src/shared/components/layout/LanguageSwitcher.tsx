import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '@/shared/i18n';
import { langPath, stripLang } from '@/shared/i18n/routing';
import { cn } from '@/shared/lib/utils';

const LABELS: Record<string, string> = { ko: '한국어', en: 'EN', ja: '日本語' };

/**
 * 언어 전환. **URL 을 바꾼다 — i18n 상태만 바꾸지 않는다.**
 *
 * 예전엔 `i18n.changeLanguage()` 만 불렀다. 그러면 화면은 영어가 되는데 주소는 그대로라,
 * 그 URL 을 공유하면 상대는 한국어를 본다. 지금은 언어가 URL 에 있으니(LangLayout 이 그걸 읽는다)
 * 경로만 갈아 끼우면 언어는 저절로 따라온다. 쿼리(검색 조건)는 그대로 들고 간다.
 */
export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const { pathname, search, hash } = useLocation();
  const current = i18n.language?.split('-')[0] ?? 'ko';

  return (
    <div className="flex items-center gap-1">
      {SUPPORTED_LANGUAGES.map((lng) => (
        <button
          key={lng}
          onClick={() =>
            navigate(`${langPath(stripLang(pathname), lng)}${search}${hash}`)
          }
          className={cn(
            'rounded-lg px-2 py-1 text-xs font-medium transition-colors',
            current === lng ? 'bg-primary-50 text-primary-700' : 'text-slate-500 hover:bg-slate-100',
          )}
        >
          {LABELS[lng] ?? lng}
        </button>
      ))}
    </div>
  );
}
