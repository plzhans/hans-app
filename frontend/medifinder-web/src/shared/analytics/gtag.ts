/**
 * 이용 통계(Google Analytics 4). **측정 ID 가 있을 때만 켜진다.**
 *
 * VITE_GOOGLE_ANALYTICS_ID 로 주입하고, 비어 있으면(local·develop 기본) 스크립트를 아예 받지
 * 않는다. **그래서 index.html 에 스니펫을 박지 않는다** — vite 가 `%VITE_...%` 치환은 해 주지만
 * 값이 비어도 gtag.js 는 그대로 로드돼 요청이 나가서, "비우면 끈다" 가 성립하지 않는다.
 * monitoring/instrument.ts 의 Sentry 가 DSN 없으면 init 을 안 하는 것과 같은 모양·같은 이유다.
 *
 * [화면 전환을 직접 쏘는 이유]
 * GA 의 향상된 측정에 맡길 수도 있다 — 구글은 History API 를 쓰는 SPA 에 그쪽을 권장하고,
 * 이 앱의 createBrowserRouter 가 정확히 그 경우다. 그런데 `/ko/*` 로 들어오면 StripKoPrefix 가
 * 접두사를 뗀 URL 로 한 번 더 갈아치우고(replaceState), 향상된 측정은 **그 중간 URL 까지 센다.**
 * 언제 보낼지를 우리가 쥐고 있어야 그걸 건너뛸 수 있다(App.tsx 의 RouteTracker).
 * 포털웹(hansapp-web)도 같은 방식이라 저장소 안에서 방식이 갈리지 않는다.
 *
 * **콘솔 설정과 짝이다.** 직접 쏘는 대신 데이터 스트림 > 향상된 측정 > 페이지 조회수 >
 * 고급 설정에서 "브라우저 기록 이벤트 기반 페이지 변경" 을 꺼야 한다. 둘 다 살아 있으면
 * 화면을 옮길 때마다 두 번 집계된다. 콘솔에서 맞출 값은 docs/google-analytics.md 에 있다.
 */
const MEASUREMENT_ID = (import.meta.env.VITE_GOOGLE_ANALYTICS_ID as string | undefined) ?? '';

/** GA 가 설정돼 켜졌는지. 꺼져 있으면 아래 함수들이 전부 no-op 이라 호출부를 분기할 필요가 없다. */
export const gaEnabled = Boolean(MEASUREMENT_ID);

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

/** gtag.js 를 한 번 붙이고 기본 설정을 한다. 앱 부팅 때 1회 호출. */
export function initGa(): void {
  if (!gaEnabled) return;

  window.dataLayer = window.dataLayer ?? [];
  // gtag 는 arguments 객체를 **그대로** dataLayer 에 밀어 넣는 규약이다. 화살표 함수로 바꾸거나
  // 나머지 매개변수를 배열로 push 하면 gtag.js 가 알아보지 못한다.
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer.push(arguments);
  };
  window.gtag('js', new Date());
  // 첫 화면을 포함해 page_view 는 trackPageView 가 보낸다. 여기서 자동 전송을 켜 두면 두 번 잡힌다.
  window.gtag('config', MEASUREMENT_ID, { send_page_view: false });

  /*
    **스크립트 다운로드는 첫 화면이 그려진 뒤로 미룬다.**

    gtag.js 는 170KB 에 실행 130ms 라 첫 화면과 자원을 다툰다. async 라 렌더를 막지는 않지만,
    느린 회선에서는 그만큼 앱 번들이 늦게 온다.

    **이벤트는 하나도 안 잃는다.** 위에서 dataLayer 와 gtag 를 이미 만들어 뒀으므로,
    스크립트보다 먼저 불린 trackPageView 는 큐에 쌓였다가 gtag.js 가 로드되며 한꺼번에 처리된다.
    그게 gtag 의 원래 규약이다.
  */
  const load = () => {
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
    document.head.appendChild(script);
  };
  // requestIdleCallback 이 없는 브라우저(사파리)는 setTimeout 으로 다음 틱에 민다.
  const idle = window.requestIdleCallback as typeof window.requestIdleCallback | undefined;
  const whenIdle = (fn: () => void) =>
    idle ? idle(fn, { timeout: 3000 }) : window.setTimeout(fn, 1);

  if (document.readyState === 'complete') whenIdle(load);
  else window.addEventListener('load', () => whenIdle(load), { once: true });
}

/**
 * 지금 화면을 page_view 로 보낸다. 라우트가 바뀔 때마다 호출한다.
 *
 * **page_location(전체 URL)을 싣는다.** GA4 는 페이지 경로도 호스트 이름도 이 값에서 뽑아 내므로,
 * UA 시절 파라미터인 page_path 만 보내면 리포트가 첫 진입 URL 에 머문 채로 남는다.
 * 호출 시점이 라우팅 직후라 window.location 은 이미 새 주소다.
 */
export function trackPageView(): void {
  if (!gaEnabled) return;
  window.gtag('event', 'page_view', {
    page_location: window.location.href,
    page_title: document.title,
  });
}
