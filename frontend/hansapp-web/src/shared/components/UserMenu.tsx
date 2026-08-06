import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AUTH_WEB_URL } from '@/shared/config/env';
import { useAuthStore } from '@/shared/auth/authStore';
import { startLogout } from '@/shared/auth/login';

/**
 * 로그인한 사용자 메뉴. **이름만 보이고 누르면 펼쳐진다.**
 *
 * 예전에는 이메일과 로그아웃 버튼이 헤더에 늘 나와 있었다. 두 가지가 걸린다 —
 * 이메일은 남이 보는 화면에 상시 띄울 값이 아니고(어깨너머로 읽힌다), 로그아웃은 자주 쓰지도
 * 않으면서 가장 누르기 쉬운 자리를 차지한다. 이름만 두고 접으면 둘 다 해결된다.
 *
 * 로그인해야 보이는 것은 전부 여기로 모은다(마이페이지·앱 관리·로그아웃). 헤더에 흩어 두면
 * 로그인 여부에 따라 메뉴 개수가 들쭉날쭉해 폭이 흔들리고, 어느 것이 계정에 딸린 것인지도
 * 안 보인다. 반대로 Blog·Docs 처럼 **누구나 보는 링크는 헤더에 그대로 둔다.**
 *
 * 마이페이지는 **인증웹(auth.plzhans.com/me)에 있다.** 계정은 여러 서비스가 함께 쓰는
 * HansApp 계정이라, 계정을 보고 고치는 자리도 서비스마다 두지 않고 한 곳에 모은다.
 * 앱 관리는 포털 자신의 화면이라 라우터 링크(Link)이고, 마이페이지만 바깥 주소(a)다.
 */
export function UserMenu() {
  const me = useAuthStore((s) => s.me);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 바깥을 누르거나 Esc 로 닫는다. 드롭다운이 열린 채 남아 있으면 다른 것을 가린다.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // 이름을 안 넣은 계정도 있다. 그때는 이메일 앞부분으로 대신한다 — 빈 버튼보다 낫다.
  const label = me?.name || me?.email?.split('@')[0] || '내 계정';

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
      >
        {label}
        <Caret open={open} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg"
        >
          {/* 이메일은 메뉴를 열었을 때만 보인다 — 어느 계정인지 확인하는 용도다. */}
          {me?.email && (
            <p className="truncate border-b border-gray-100 px-4 py-3 text-xs text-gray-500">
              {me.email}
            </p>
          )}

          {/*
            인증웹 주소가 비면(로컬에서 안 띄운 경우) 죽은 링크를 만들지 않고 감춘다.
            로그아웃은 그 경우에도 남아야 한다 — 나갈 방법까지 사라지면 안 된다.
          */}
          {AUTH_WEB_URL && (
            <a
              href={`${AUTH_WEB_URL}/me`}
              role="menuitem"
              className="block px-4 py-2.5 text-sm text-gray-700 transition hover:bg-gray-50"
            >
              마이페이지
            </a>
          )}

          <Link
            to="/apps"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-sm text-gray-700 transition hover:bg-gray-50"
          >
            앱 관리
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => startLogout()}
            className="block w-full px-4 py-2.5 text-left text-sm text-gray-700 transition hover:bg-gray-50"
          >
            로그아웃
          </button>
        </div>
      )}
    </div>
  );
}

/** 펼침 상태를 알려 주는 화살표. 장식이라 스크린 리더에서는 숨긴다(aria-expanded 가 말한다). */
function Caret({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className={`h-3.5 w-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
      fill="currentColor"
    >
      <path d="M5.5 7.5 10 12l4.5-4.5H5.5Z" />
    </svg>
  );
}
