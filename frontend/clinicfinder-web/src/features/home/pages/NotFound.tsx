import { LangLink } from '@/shared/i18n/LangLink';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/Button';

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center py-24 text-center">
      <p className="text-5xl font-bold text-primary-600">404</p>
      <p className="mt-3 text-slate-500">Page not found</p>
      <LangLink to="/" className="mt-6">
        <Button variant="secondary">{t('nav.home')}</Button>
      </LangLink>
    </div>
  );
}
