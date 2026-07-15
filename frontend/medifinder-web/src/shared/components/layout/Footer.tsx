import { useTranslation } from 'react-i18next';

export function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="border-t border-slate-200 bg-white py-6">
      <div className="mx-auto max-w-4xl px-4 text-center text-xs text-slate-400">
        <p className="font-semibold text-slate-500">{t('app.name')}</p>
        <p className="mt-1">{t('app.tagline')}</p>
        <p className="mt-2">© {'2026'} medifinder.kr</p>
      </div>
    </footer>
  );
}
