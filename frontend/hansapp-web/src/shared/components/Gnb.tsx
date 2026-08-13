import { Link } from 'react-router-dom';
import { useAuthStore } from '@/shared/auth/authStore';
import { startLogin } from '@/shared/auth/login';
import { UserMenu } from '@/shared/components/UserMenu';
import { LINKS } from '@/shared/config/links';
import { cn } from '@/shared/lib/cn';
import { PAGE_CONTAINER } from '@/shared/ui/layout';

const MENU = [
  // MediFinder 는 상단 헤더에서 일단 뺀다(링크 설정은 links.ts 에 남겨 둠).
  //
  // newTab 은 **다른 사이트로 나갈 때만** 준다. 문서는 같은 도메인의 /docs 라
  // 새 탭에 띄우면 탭만 쌓이고, 문서 상단의 HOME 으로 되돌아올 수도 있다.
  { label: 'Blog', href: LINKS.blog, newTab: true },
  { label: 'Docs', href: LINKS.docs },
];

/** 상단 글로벌 내비게이션. 서비스 바로가기 메뉴 + 로그인 상태별 버튼. */
export function Gnb() {
  const status = useAuthStore((s) => s.status);

  return (
    <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/90 backdrop-blur">
      <div className={cn(PAGE_CONTAINER, 'flex h-14 items-center justify-between')}>
        <div className="flex items-center gap-6">
          <Link to="/" className="text-lg font-extrabold text-primary">
            HansApp
          </Link>
          <nav className="hidden items-center gap-4 sm:flex">
            {MENU.map((m) => (
              <a
                key={m.label}
                href={m.href}
                target={m.newTab ? '_blank' : undefined}
                rel={m.newTab ? 'noreferrer' : undefined}
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
            /* 이름만 보이고 누르면 앱 관리·마이페이지·로그아웃이 펼쳐진다. UserMenu 주석 참고. */
            <UserMenu />
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
