import type { EnhanceAppContext } from 'vitepress';

/**
 * 태그 페이지(한 페이지에 여러 오퍼레이션)에서 스크롤 위치에 따라
 * 왼쪽 사이드바의 활성 항목을 갱신한다(scroll-spy).
 *
 * VitePress 기본 사이드바는 클릭 시 앵커로 이동만 하고 스크롤에 따라
 * 활성 표시를 바꾸지 않아, 클릭한 항목이 계속 강조된 채로 남는다. 이를 보완한다.
 */
export function setupSidebarScrollSpy({ router }: EnhanceAppContext): void {
  if (typeof window === 'undefined') {
    return;
  }

  // 상단 고정 네비 높이를 고려한 감지 기준선(px).
  const OFFSET = 120;
  let raf = 0;

  const anchors = (): HTMLElement[] =>
    Array.from(document.querySelectorAll<HTMLElement>('[id^="op-"]'));

  function setActive(id: string | null): void {
    const links = document.querySelectorAll<HTMLAnchorElement>(
      '.VPSidebar a[href*="#op-"]',
    );
    links.forEach((a) => {
      const href = a.getAttribute('href') ?? '';
      const match = !!id && href.endsWith(`#${id}`);
      // VitePress 자체 강조 클래스를 직접 토글한다(라우트에만 반응하는 기본 동작을 대체).
      // 링크: .link.active / 감싸는 항목: .VPSidebarItem.is-active (인디케이터 바 포함)
      a.classList.toggle('active', match);
      a.closest('.VPSidebarItem')?.classList.toggle('is-active', match);
    });
  }

  function update(): void {
    const list = anchors();
    if (!list.length) {
      // 오퍼레이션 앵커가 없는 페이지(홈/인증 등)에서는 아무것도 하지 않는다.
      setActive(null);
      return;
    }
    // 기준선(OFFSET) 위로 지나간 마지막 앵커가 "현재" 섹션.
    let currentId = list[0].id;
    for (const el of list) {
      if (el.getBoundingClientRect().top <= OFFSET) {
        currentId = el.id;
      } else {
        break;
      }
    }
    setActive(currentId);
    // URL 해시도 현재 섹션으로 맞춘다(스크롤 점프 없이, 히스토리 누적 없이).
    if (location.hash !== `#${currentId}`) {
      history.replaceState(history.state, '', `#${currentId}`);
    }
  }

  function onScroll(): void {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(update);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });

  // 라우트 변경/최초 로드 시 사이드바·앵커 DOM 이 갱신된 뒤 초기 하이라이트.
  const prev = router.onAfterRouteChanged;
  router.onAfterRouteChanged = (to: string) => {
    prev?.(to);
    window.setTimeout(update, 60);
  };
  requestAnimationFrame(() => window.setTimeout(update, 60));
}
