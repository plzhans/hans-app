import { Link, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Stethoscope } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useLangPath } from '@/shared/i18n/routing';
import { LanguageSwitcher } from './LanguageSwitcher';

export function Header() {
  const { t } = useTranslation();

  // NavLink 는 활성 스타일 때문에 LangLink 로 감싸지 않고 경로만 만들어 붙인다.
  const path = useLangPath();

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
        <Link to={path('/')} className="flex items-center gap-2 font-bold text-primary-700">
          <Stethoscope className="h-5 w-5" />
          <span>{t('app.name')}</span>
        </Link>
        <nav className="flex items-center gap-4">
          <NavLink
            to={path('/search')}
            className={({ isActive }) =>
              cn('text-sm font-medium', isActive ? 'text-primary-700' : 'text-slate-500 hover:text-slate-800')
            }
          >
            {t('nav.search')}
          </NavLink>
          <LanguageSwitcher />
        </nav>
      </div>
    </header>
  );
}
