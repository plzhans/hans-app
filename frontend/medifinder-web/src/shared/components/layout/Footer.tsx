import { useTranslation } from 'react-i18next';
import { CONTACT_EMAIL } from '../../config/contact';

export function Footer() {
  const { t } = useTranslation();
  return (
    // 세이프에어리어(홈 인디케이터) 위로 마지막 줄이 걸리지 않게 아래를 더 띄운다.
    <footer className="border-t border-line bg-surface pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6">
      <div className="mx-auto max-w-7xl px-4 text-center text-xs text-ink-subtle">
        <p className="font-bold text-ink-muted">{t('app.name')}</p>
        <p className="mt-1">{t('app.tagline')}</p>
        <p className="mt-2">
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-ink-muted no-underline active:text-brand"
          >
            {CONTACT_EMAIL}
          </a>
        </p>
        <p className="mt-1">© {'2026'} medifinder.kr</p>
      </div>
    </footer>
  );
}
