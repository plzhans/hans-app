import { Outlet } from 'react-router-dom';
import { Header } from '@/shared/components/layout/Header';
import { Footer } from '@/shared/components/layout/Footer';
import { AiSearchLauncher } from '@/features/ai-search/components/AiSearchLauncher';

/**
 * 목록 계열(첫 화면·검색)의 껍데기.
 *
 * **본문 폭을 여기서 잡지 않는다.** 첫 화면의 파란 히어로가 화면 끝까지 닿아야 하는데,
 * 여기서 max-width 와 좌우 여백을 걸면 그 색이 가운데 상자 안에만 갇힌다.
 * 폭은 각 화면이 자기 조각마다 정한다 — 히어로·탭 바는 꽉 채우고, 카드만 가운데로 모은다
 * (DetailLayout 과 같은 규칙이다).
 */
export function MainLayout() {
  return (
    <div className="flex min-h-full flex-col bg-surface-sunken">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />

      {/*
        AI 문의. **여기(목록 계열)에만 둔다** — 상세는 하단 전화 바가 `fixed bottom-0` 로
        같은 자리를 쓰고, 그걸 가리면서까지 얹을 만한 기능이 아니다.
        "못 찾겠다" 가 생기는 것도 홈·검색이지 병원을 이미 고른 상세가 아니다.
      */}
      <AiSearchLauncher />
    </div>
  );
}
