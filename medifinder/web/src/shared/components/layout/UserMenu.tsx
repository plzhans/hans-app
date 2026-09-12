import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { displayName } from '@/shared/auth/api';
import { LangLink } from '@/shared/i18n/LangLink';
import { useAuth } from '@/shared/auth/useAuth';
import { cn } from '@/shared/lib/utils';

/**
 * 로그인한 사용자 메뉴. **이름만 보이고 누르면 펼쳐진다.**
 *
 * 이메일은 남이 보는 화면에 늘 띄울 값이 아니고(어깨너머로 읽힌다), 로그아웃은 자주 쓰지도
 * 않으면서 가장 누르기 쉬운 자리를 차지한다. 이름만 두고 접으면 둘 다 해결되고,
 * 포털(plzhans.com)의 헤더와도 같은 모양이 된다 — 같은 계정을 쓰는 서비스끼리 계정 메뉴가
 * 다르게 생기면 사용자는 다른 계정으로 의심한다.
 *
 * 마이페이지는 **이 앱 안에 있다**(`/me`). 계정을 고치는 자리는 HansApp 인증웹 하나지만,
 * "내가 누구로 로그인해 있는지" 를 확인하는 화면까지 남의 도메인으로 보내면 서비스 밖으로
 * 튕겨 나간 것처럼 느껴진다 — 확인은 여기서, 수정은 거기서 한다(MyPage 주석 참고).
 */
export function UserMenu() {
  const { t } = useTranslation();
  const me = useAuth((s) => s.me);
  const logout = useAuth((s) => s.logout);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 바깥을 누르거나 Esc 로 닫는다. 열린 채 남아 있으면 아래 내용을 가린다.
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

  // 이름도 이메일도 아직 없을 수 있다(캐시 없이 부팅한 직후). 빈 버튼보다는 총칭이 낫다.
  const label = displayName(me) || t('auth.account');

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex max-w-[8rem] items-center gap-1 rounded-full px-3 py-1.5 text-sm font-bold text-ink-muted transition-colors active:bg-surface-subtle"
      >
        <span className="truncate">{label}</span>
        <ChevronDown
          aria-hidden
          className={cn('h-3.5 w-3.5 shrink-0 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-1 w-56 overflow-hidden rounded-2xl bg-surface shadow-lg ring-1 ring-line"
        >
          {/* 이메일은 메뉴를 열었을 때만 보인다 — 어느 계정인지 확인하는 용도다. */}
          {me?.email && (
            <p className="truncate border-b border-line px-4 py-3 text-xs text-ink-subtle">
              {me.email}
            </p>
          )}

          <LangLink
            to="/me"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-4 py-3 text-sm font-medium text-ink no-underline active:bg-surface-subtle"
          >
            {t('auth.myPage')}
          </LangLink>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void logout();
            }}
            className="block w-full px-4 py-3 text-left text-sm font-medium text-ink active:bg-surface-subtle"
          >
            {t('auth.logout')}
          </button>
        </div>
      )}
    </div>
  );
}
