import { Outlet } from 'react-router-dom';
import { Header } from '@/shared/components/layout/Header';
import { Footer } from '@/shared/components/layout/Footer';
import { AiSearchLauncher } from '@/features/ai-search/components/AiSearchLauncher';
import { AiSearchProvider } from '@/features/ai-search/model/AiSearchPanel';

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
    /*
      AI 문의. **여기(목록 계열)에만 둔다** — 상세는 하단 전화 바가 `fixed bottom-0` 로
      같은 자리를 쓰고, 그걸 가리면서까지 얹을 만한 기능이 아니다.
      "못 찾겠다" 가 생기는 것도 홈·검색이지 병원을 이미 고른 상세가 아니다.

      **Provider 가 본문을 감싼다** — 채팅창을 여는 곳이 둘이라서다(오른쪽 아래 FAB 과
      홈 검색창 아래 버튼). 창 자체는 Provider 가 하나만 들고, 버튼들은 열어 달라고만 한다.
      본문(Outlet)이 안쪽에 있어야 홈에서도 그 손잡이를 잡을 수 있다.
    */
    <AiSearchProvider>
      <div className="flex min-h-full flex-col bg-surface-sunken">
        <Header />
        <main className="flex-1">
          <Outlet />
        </main>
        <Footer />
        <AiSearchLauncher />
      </div>
    </AiSearchProvider>
  );
}
