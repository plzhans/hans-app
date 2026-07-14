import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '@/shared/i18n';
import { cn } from '@/shared/lib/utils';

const LABELS: Record<string, string> = { ko: '한국어', en: 'EN', ja: '日本語' };

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = i18n.language?.split('-')[0] ?? 'ko';

  return (
    <div className="flex items-center gap-1">
      {SUPPORTED_LANGUAGES.map((lng) => (
        <button
          key={lng}
          onClick={() => void i18n.changeLanguage(lng)}
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
