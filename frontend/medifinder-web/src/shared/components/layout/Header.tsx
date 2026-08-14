import { Link, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Stethoscope } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useLangPath } from '@/shared/i18n/routing';
import { useAuth } from '@/shared/auth/useAuth';
import { LanguageSwitcher } from './LanguageSwitcher';
import { UserMenu } from './UserMenu';

/**
 * 목록 계열(첫 화면·검색)의 전역 헤더.
 *
 * **상세에는 없다.** 거기서는 뒤로가기 앱바가 이 자리를 대신한다(DetailLayout 주석 참고).
 * 그래서 이 헤더는 "서비스 안에 있다" 를 말하는 자리이고, 상세의 앱바는 "지금 이 병원을
 * 보고 있다" 를 말하는 자리다 — 둘을 한 화면에 겹쳐 쌓지 않는다.
 */
export function Header() {
  const { t } = useTranslation();

  // NavLink 는 활성 스타일 때문에 LangLink 로 감싸지 않고 경로만 만들어 붙인다.
  const path = useLangPath();

  return (
    <header className="sticky top-0 z-30 bg-surface/85 pt-safe-top backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <Link
          to={path('/')}
          className="flex items-center gap-2 font-extrabold tracking-tight text-brand no-underline"
        >
          {/* 로고 아이콘도 구역 표지와 같은 연파랑 판 위에 올린다 — 화면끼리 같은 말투가 된다. */}
          <span className="flex h-[1.75rem] w-[1.75rem] items-center justify-center rounded-lg bg-brand-tint">
            <Stethoscope className="h-4 w-4" />
          </span>
          <span>{t('app.name')}</span>
        </Link>

        <nav className="flex items-center gap-3">
          <NavLink
            to={path('/search')}
            className={({ isActive }) =>
              cn(
                'rounded-full px-3 py-1.5 text-sm font-bold no-underline transition-colors',
                isActive
                  ? 'bg-brand-tint text-brand-strong'
                  : 'text-ink-muted active:bg-surface-subtle',
              )
            }
          >
            {t('nav.search')}
          </NavLink>
          <LanguageSwitcher />
          <AuthAction />
        </nav>
      </div>
    </header>
  );
}

/**
 * 헤더 오른쪽 끝의 계정 자리. **로그인 버튼과 사용자 메뉴 중 하나만** 있다.
 *
 * 확인이 끝나기 전에는 둘 다 그리지 않는다 — 저장된 토큰을 읽는 데 한 틱이 걸리는데,
 * 그동안 로그인 버튼을 그려 두면 이미 로그인한 사람에게 매번 그 버튼이 번쩍이고 이름으로
 * 바뀐다. 대신 같은 크기의 자리 표시자를 둬서 그 순간 옆 메뉴들이 밀리지 않게 한다.
 */
function AuthAction() {
  const { t } = useTranslation();
  const status = useAuth((s) => s.status);
  const login = useAuth((s) => s.login);

  if (status === 'loading') {
    return <div className="h-8 w-16 animate-pulse rounded-full bg-surface-subtle" />;
  }
  if (status === 'authenticated') {
    return <UserMenu />;
  }
  return (
    <button
      type="button"
      onClick={() => void login()}
      className="rounded-full bg-brand px-3.5 py-1.5 text-sm font-bold text-white transition-transform duration-100 ease-native active:scale-[0.97]"
    >
      {t('auth.login')}
    </button>
  );
}
