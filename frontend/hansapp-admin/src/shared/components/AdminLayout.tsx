import { useEffect, useState, type ReactNode } from 'react';
import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

import { cn } from '@/shared/lib/cn';
import { Breadcrumb, type Crumb } from './Breadcrumb';
import { Footer } from './Footer';
import { Sidebar } from './Sidebar';
import { UserMenu } from './UserMenu';

/** 접힘 상태를 기억하는 키. 새로고침마다 다시 펴지면 접는 의미가 없다. */
const COLLAPSE_KEY = 'hansapp.admin.sidebarCollapsed';

interface Props {
  /** 화면 제목. 본문 위 큰 글씨. */
  title: string;
  /** 제목 아래 한 줄 설명(선택). */
  description?: string;
  /** 사이트맵. 맨 앞의 "홈" 은 Breadcrumb 가 자동으로 붙인다. */
  breadcrumbs: Crumb[];
  /** 제목 줄 오른쪽에 놓을 것(버튼 등). */
  /**
   * 이 페이지의 행동들. **본문(표·카드) 바로 위 한 줄**에 그려진다.
   *
   * **머리(제목·사이트맵) 쪽에 두지 않는다.** 거기 두면 경로 옆에 붙어 버튼이 경로의
   * 일부처럼 읽히고, 무엇에 하는 행동인지도 다루는 것에서 멀어진다. 화면마다 자리를 손으로
   * 잡지 않고 이 슬롯 하나로 정해 두는 것이 이 프로퍼티의 목적이다.
   *
   * 기본은 **오른쪽 정렬**이다. 목록으로 돌아가는 링크처럼 왼쪽 끝에 붙일 것은
   * `className="mr-auto"` 를 준다.
   *
   * ```tsx
   * actions={
   *   <>
   *     <Link to="/boards" className="mr-auto …">게시판 목록</Link>
   *     <Link to="…/new" className="…">글쓰기</Link>
   *   </>
   * }
   * ```
   */
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * 관리 화면 공통 레이아웃. **AdminLTE 의 전통 구조를 따른다.**
 *
 *   ┌──────────┬─────────────────────────────┐
 *   │ 브랜드    │ 상단바 (토글 · 계정 · 로그아웃) │
 *   ├──────────┼─────────────────────────────┤
 *   │ 사이드     │ 제목 + 사이트맵              │
 *   │ 메뉴      ├─────────────────────────────┤
 *   │          │ 본문                         │
 *   └──────────┴─────────────────────────────┘
 *
 * 사이드바만 `fixed` 이고 본문이 그만큼 밀려난다(margin-left). 사이드바까지 문서 흐름에
 * 두면 본문이 길어질 때 메뉴가 같이 스크롤돼 위로 사라진다.
 */
export function AdminLayout({
  title,
  description,
  breadcrumbs,
  actions,
  children,
}: Props) {
  // 데스크톱 접힘. localStorage 를 읽는 초기화라 함수형으로 넘겨 첫 렌더에만 돈다.
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  // 모바일 서랍. 데스크톱에서는 쓰이지 않는다.
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch {
      // 사파리 프라이빗 등. 기억만 못 할 뿐 동작에는 지장이 없다.
    }
  }, [collapsed]);

  return (
    <div className="min-h-full">
      <Sidebar
        collapsed={collapsed}
        open={drawerOpen}
        onNavigate={() => setDrawerOpen(false)}
      />

      {/* 모바일에서 서랍이 열렸을 때 뒤를 덮는 막. 누르면 닫힌다. */}
      {drawerOpen && (
        <button
          type="button"
          aria-label="메뉴 닫기"
          onClick={() => setDrawerOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
        />
      )}

      <div
        className={cn(
          'flex min-h-full flex-col transition-all duration-200',
          collapsed ? 'lg:ml-16' : 'lg:ml-60',
        )}
      >
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-gray-200 bg-white px-4">
          {/* 모바일: 서랍 열기 / 데스크톱: 접기·펴기 */}
          <button
            type="button"
            aria-label="메뉴 열기"
            onClick={() => setDrawerOpen(true)}
            className="-ml-1 rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label={collapsed ? '메뉴 펴기' : '메뉴 접기'}
            onClick={() => setCollapsed((v) => !v)}
            className="-ml-1 hidden rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 lg:block"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-5 w-5" />
            ) : (
              <PanelLeftClose className="h-5 w-5" />
            )}
          </button>

          <div className="flex-1" />

          <UserMenu />
        </header>

        {/* 제목 + 사이트맵. AdminLTE 의 content-header 자리다. */}
        <div className="border-b border-gray-200 bg-white px-4 py-4 sm:px-6">
          {/*
            **경로는 제목 위, 행동은 오른쪽 끝이다.** 둘을 한 묶음으로 오른쪽에 두면
            "커뮤니티 › 게시판 › 공지사항 [글쓰기]" 처럼 경로 끝에 버튼이 붙어 읽힌다 —
            버튼이 경로의 일부처럼 보인다.
          */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <Breadcrumb items={breadcrumbs} />
              <h1 className="mt-1 truncate text-xl font-bold text-gray-900">
                {title}
              </h1>
              {description && (
                <p className="mt-1 text-sm text-gray-500">{description}</p>
              )}
            </div>
          </div>
        </div>

        <main className="flex-1 px-4 py-6 sm:px-6">
          {actions && (
            <div className="mb-3 flex items-center justify-end gap-2">
              {actions}
            </div>
          )}
          {children}
        </main>

        {/* 본문이 flex-1 이라 짧은 화면에서도 여기가 바닥에 붙는다. */}
        <Footer />
      </div>
    </div>
  );
}
