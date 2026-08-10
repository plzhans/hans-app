import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, KeyRound, LogOut, User } from 'lucide-react';

import { useAuthStore } from '@/shared/auth/authStore';
import { cn } from '@/shared/lib/cn';

/**
 * 상단바 오른쪽 계정 메뉴.
 *
 * 이름을 누르면 내정보·비밀번호 변경·로그아웃이 펼쳐진다.
 *
 * **바깥을 누르거나 Esc 로 닫힌다.** 열어 놓고 다른 곳을 눌렀는데 안 닫히면
 * 화면을 가린 채 남아 "먹통" 으로 읽힌다.
 */
export function UserMenu() {
  const me = useAuthStore((s) => s.me);
  const signOut = useAuthStore((s) => s.signOut);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      // 메뉴 안을 누른 것이면 닫지 않는다(항목을 고르는 중일 수 있다).
      if (ref.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    // click 이 아니라 pointerdown 이다 — click 은 버튼을 누른 그 이벤트가 여기까지 올라와
    // 열자마자 닫히는 일이 생긴다(누르는 시점과 떼는 시점이 갈린다).
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const label = me?.name ?? me?.email ?? '계정';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition',
          open ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-100',
        )}
      >
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary-50 text-xs font-bold text-primary-700">
          {label.slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden max-w-[160px] truncate sm:inline">{label}</span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-gray-400 transition',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
        >
          {/* 누구로 로그인했는지. 이름만 보이는 경우 이메일을 여기서 확인한다. */}
          <div className="border-b border-gray-100 px-4 py-2.5">
            <p className="truncate text-sm font-semibold text-gray-900">
              {me?.name ?? '—'}
            </p>
            <p className="truncate text-xs text-gray-500">{me?.email}</p>
          </div>

          <MenuLink to="/me" icon={User} onClick={() => setOpen(false)}>
            내정보
          </MenuLink>
          <MenuLink
            to="/password"
            icon={KeyRound}
            onClick={() => setOpen(false)}
          >
            비밀번호 변경
          </MenuLink>

          <div className="my-1 border-t border-gray-100" />

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
            className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm text-red-600 transition hover:bg-red-50"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            로그아웃
          </button>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  to,
  icon: Icon,
  onClick,
  children,
}: {
  to: string;
  icon: typeof User;
  onClick: () => void;
  children: string;
}) {
  return (
    <Link
      to={to}
      role="menuitem"
      onClick={onClick}
      className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-50"
    >
      <Icon className="h-4 w-4 shrink-0 text-gray-400" />
      {children}
    </Link>
  );
}
