import { Link } from 'react-router-dom';
import { useAuthStore } from '@/shared/auth/authStore';
import { startLogin } from '@/shared/auth/login';
import { LINKS } from '@/shared/config/links';

const MENU = [
  { label: 'MediFinder', href: LINKS.medifinder },
  { label: 'Blog', href: LINKS.blog },
  { label: 'Docs', href: LINKS.docs },
];

/** 상단 글로벌 내비게이션. 서비스 바로가기 메뉴 + 로그인 상태별 버튼. */
export function Gnb() {
  const status = useAuthStore((s) => s.status);
  const me = useAuthStore((s) => s.me);
  const signOut = useAuthStore((s) => s.signOut);

  return (
    <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link to="/" className="text-lg font-extrabold text-primary">
            HansApp
          </Link>
          <nav className="hidden items-center gap-4 sm:flex">
            {MENU.map((m) => (
              <a
                key={m.label}
                href={m.href}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-gray-500 transition hover:text-gray-900"
              >
                {m.label}
              </a>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {status === 'loading' ? (
            // 인증 확인 전에는 어느 버튼도 그리지 않는다(로그인↔로그아웃 깜빡임 방지).
            // 레이아웃 밀림을 막으려 버튼 크기의 스켈레톤을 자리만 잡아 둔다.
            <div className="h-8 w-20 animate-pulse rounded-lg bg-gray-100" />
          ) : status === 'authenticated' ? (
            <>
              <Link
                to="/apps"
                className="text-sm font-semibold text-gray-700 transition hover:text-primary"
              >
                앱 관리
              </Link>
              <span className="hidden text-sm text-gray-500 sm:inline">
                {me?.email}
              </span>
              <button
                type="button"
                onClick={() => void signOut()}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
              >
                로그아웃
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => void startLogin()}
              className="rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-primary-700"
            >
              로그인
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
