import { Link, NavLink } from 'react-router-dom';

import { NAV_SECTIONS } from '@/shared/config/nav';
import { cn } from '@/shared/lib/cn';

interface Props {
  /** 데스크톱에서 접힌 상태(아이콘만). 모바일은 이 값과 무관하게 항상 펼친 모양이다. */
  collapsed: boolean;
  /** 모바일 서랍이 열려 있는가. */
  open: boolean;
  /** 메뉴를 눌렀을 때(모바일에서 서랍을 닫는다). */
  onNavigate: () => void;
}

/**
 * 좌측 사이드바. AdminLTE 의 구조를 따른다 — 맨 위 브랜드, 아래로 메뉴.
 *
 * **어두운 배경을 쓴다.** 본문(흰 카드 + 회색 바탕)과 확실히 갈라져야 "지금 어디를 보고
 * 있는지" 가 한눈에 들어온다. 관리 콘솔의 관례이기도 하다.
 *
 * 좁은 화면에서는 서랍(drawer)으로 바뀌어 본문 위에 겹친다 — 사이드바가 자리를 차지하면
 * 표를 볼 공간이 없어진다.
 */
export function Sidebar({ collapsed, open, onNavigate }: Props) {
  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 flex flex-col bg-gray-900 text-gray-300 transition-all duration-200',
        // 모바일: 화면 밖에 두었다가 열릴 때 밀어 넣는다.
        open ? 'translate-x-0' : '-translate-x-full',
        // 데스크톱(lg~): 항상 보이고, 접힘 여부로 폭만 바뀐다.
        'lg:translate-x-0',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      {/* 브랜드. 누르면 첫 화면으로. 상단바와 높이를 맞춰야 가로줄이 이어져 보인다. */}
      <Link
        to="/users"
        onClick={onNavigate}
        className="flex h-14 shrink-0 items-center gap-2 border-b border-white/10 px-4 transition hover:bg-white/5"
      >
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded bg-primary text-sm font-extrabold text-white">
          H
        </span>
        {!collapsed && (
          <span className="truncate text-sm font-bold text-white">
            HansApp{' '}
            <span className="text-xs font-semibold text-gray-400">ADMIN</span>
          </span>
        )}
      </Link>

      <nav className="flex-1 overflow-y-auto py-3">
        {NAV_SECTIONS.map((section, i) => (
          <div key={section.title ?? i} className="mb-2">
            {section.title && !collapsed && (
              <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                {section.title}
              </p>
            )}
            {section.items.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                // 기본은 부분 일치라 "/batch" 가 "/batch/stages" 에서도 같이 켜진다.
                // 메뉴 항목끼리 부모·자식 경로가 아니므로 정확히 일치할 때만 켠다.
                end
                onClick={onNavigate}
                // 접혔을 때는 글자가 없으니 마우스를 올리면 이름이 뜨게 한다.
                title={collapsed ? label : undefined}
                className={({ isActive }) =>
                  cn(
                    'mx-2 flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition',
                    collapsed && 'justify-center px-0',
                    isActive
                      ? 'bg-primary font-semibold text-white'
                      : 'text-gray-300 hover:bg-white/10 hover:text-white',
                  )
                }
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                {!collapsed && <span className="truncate">{label}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
