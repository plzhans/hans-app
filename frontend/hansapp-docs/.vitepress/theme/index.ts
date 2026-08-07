import type { Theme } from 'vitepress';
import { inBrowser } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import { theme, useOpenapi } from 'vitepress-openapi/client';
import 'vitepress-openapi/dist/style.css';
import './custom.css';
import VPHomeHero from 'vitepress/dist/client/theme-default/components/VPHomeHero.vue';
import VPHomeFeatures from 'vitepress/dist/client/theme-default/components/VPHomeFeatures.vue';
import Layout from './Layout.vue';
import ApiOperation from './ApiOperation.vue';
import ParamsTable from './ParamsTable.vue';
import RequestBodyTable from './RequestBodyTable.vue';
import ResponsesTable from './ResponsesTable.vue';
import { setupSidebarScrollSpy } from './scrollspy';
import { initGa, trackPageView } from './gtag';
import { initSentry } from './sentry';

// 스펙은 .vitepress/config.ts 의 vite.define 로 빌드시 주입된다(정적 import 아님).
declare const __OPENAPI_SPEC__: Record<string, unknown>;

// vitepress-openapi 의 OA* 컴포넌트(OAOperation 등)를 전역 등록하고
// OpenAPI 스펙을 주입한다. 이후 마크다운/동적 라우트에서 spec 을 다시 넘길 필요가 없다.
export default {
  extends: DefaultTheme,
  // 기본 레이아웃 + 하단 고지(Footer). 기본 푸터는 사이드바가 있으면 감춰져서 못 쓴다.
  Layout,
  async enhanceApp(ctx) {
    const { app } = ctx;
    useOpenapi({ spec: __OPENAPI_SPEC__ });
    theme.enhanceApp({ app });
    // 파라미터/응답을 실제 표로 그리는 커스텀 컴포넌트(OAOperation 슬롯에서 사용).
    /*
      홈 화면 조각(히어로·기능 카드)을 **문서 레이아웃에서도 쓸 수 있게** 전역 등록한다.

      `layout: home` 을 쓰면 VitePress 가 사이드바를 하드코딩으로 빼기 때문에
      (`frontmatter.layout !== 'home'`), 첫 페이지만 목차가 사라진다. 그렇다고 히어로를
      직접 다시 만들면 디자인이 갈리므로, 기본 테마의 컴포넌트를 그대로 가져다 쓴다.
      둘 다 frontmatter(hero·features)를 스스로 읽으므로 마크다운에 놓기만 하면 된다.
    */
    app.component('VPHomeHero', VPHomeHero);
    app.component('VPHomeFeatures', VPHomeFeatures);
    app.component('ParamsTable', ParamsTable);
    app.component('RequestBodyTable', RequestBodyTable);
    app.component('ResponsesTable', ResponsesTable);
    // 태그 페이지에서 오퍼레이션마다 사용하는 래퍼(위 슬롯 구성 포함).
    app.component('ApiOperation', ApiOperation);
    // 스크롤 위치에 따라 사이드바 활성 항목을 갱신(scroll-spy).
    setupSidebarScrollSpy(ctx);

    // Google Analytics(gtag.js). VITE_GOOGLE_ANALYTICS_ID 가 있을 때만 로드된다.
    // SPA 라 첫 진입은 여기서 직접 보내고, 이후 라우트 이동은 onAfterRouteChanged 로 보낸다.
    if (inBrowser) {
      // 에러 추적(VITE_SENTRY_DSN 이 있을 때만). GA 보다 먼저 붙인다 — 뒤이은 초기화에서
      // 나는 에러도 잡히게. SSG 렌더(Node)에서는 부르지 않는다.
      initSentry(app);

      initGa();
      trackPageView(location.pathname + location.search);
      const prev = ctx.router.onAfterRouteChanged;
      ctx.router.onAfterRouteChanged = (to) => {
        prev?.(to);
        trackPageView(to);
      };
    }
  },
} satisfies Theme;
