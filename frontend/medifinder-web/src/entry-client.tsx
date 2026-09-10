// ⚠️ **이 import 가 항상 첫 줄이어야 한다.** App 모듈이 최상위에서 라우터를 만들기 때문에,
// 그 전에 Sentry.init 이 끝나야 pageload 트랜잭션과 라우팅 계측이 붙는다(VITE_SENTRY_DSN 있을 때만).
import '@/shared/monitoring/instrument';

import { createRoot, hydrateRoot } from 'react-dom/client';
import { hydrate, type DehydratedState } from '@tanstack/react-query';
import i18n from '@/shared/i18n';
import { Providers, createQueryClient } from '@/app/Providers';
import { initGa } from '@/shared/analytics/gtag';
import App from '@/app/App';
import './globals.css';

console.log('[app] VITE_HANSAPP_BASE_URL =', import.meta.env.VITE_HANSAPP_BASE_URL ?? '(not set)');

// Sentry 와 달리 라우터 생성보다 먼저일 필요는 없다 — page_view 는 RouteTracker 가 마운트된 뒤에
// 보내기 때문이다. 측정 ID 가 없으면(local·develop) 아무 일도 하지 않는다.
initGa();

const queryClient = createQueryClient();

/*
  워커가 그려 보낸 화면의 재료. 그 병원 상세를 이미 받아 온 상태로 시작하므로, 화면이
  뜨자마자 같은 것을 다시 부르지 않는다(cloudflare/workers/main.ts 의 stateScript).

  없으면 그냥 지나간다 — 상세가 아닌 경로와 개발 서버가 그렇다.
*/
const ssrState = (window as { __RQ_STATE__?: DehydratedState }).__RQ_STATE__;
if (ssrState) hydrate(queryClient, ssrState);

// 언어를 바꾸면 서버 응답(Lang 헤더 기준)이 달라지는 쿼리들을 모두 다시 가져온다.
i18n.on('languageChanged', () => {
  void queryClient.invalidateQueries();
});

const container = document.getElementById('root')!;
const tree = (
  <Providers queryClient={queryClient}>
    <App />
  </Providers>
);

/*
  **이미 그려진 내용이 있으면 이어받고, 없으면 새로 그린다.**

  워커가 서버에서 그려 보낸 화면(병원 상세)은 hydrateRoot 로 넘겨받는다 — 다시 그리지 않고
  이벤트만 붙이므로 깜빡임이 없다. 그 밖의 경로와 로컬 dev 서버는 #root 가 비어 있는데,
  빈 컨테이너에 hydrate 하면 React 가 불일치로 보고 경고를 낸 뒤 통째로 다시 그린다.

  한 진입점이 두 상황을 다 감당해야 해서 여기서 가른다.
*/
if (container.firstElementChild) {
  hydrateRoot(container, tree);
} else {
  createRoot(container).render(tree);
}
