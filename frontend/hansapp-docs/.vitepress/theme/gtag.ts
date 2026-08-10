/**
 * Google Analytics 4 (gtag.js).
 *
 * 측정 ID 는 **VITE_GOOGLE_ANALYTICS_ID** 환경변수로 주입한다(예: G-XXXXXXXXXX).
 * ID 가 없으면(로컬·미설정) 스크립트를 아예 로드하지 않는다 — 빈 ID 로 붙는 걸 막는다.
 * VitePress 는 SPA 라 초기 로드 외에는 URL 이 바뀌어도 페이지 로드가 없으므로,
 * 라우트 이동마다 {@link trackPageView} 로 page_view 를 직접 보낸다.
 *
 * **콘솔 설정과 짝이다.** 직접 쏘는 대신 이 속성의 데이터 스트림 > 향상된 측정 > 페이지 조회수 >
 * 고급 설정에서 "브라우저 기록 이벤트 기반 페이지 변경" 을 꺼야 한다. `send_page_view: false` 는
 * config 시점의 한 번만 막을 뿐이라, 둘 다 살아 있으면 화면 전환마다 두 번 집계된다.
 *
 * (hansapp-web · medifinder-web 의 src/shared/analytics/gtag.ts 와 같은 구현이다.)
 */
const GA_ID = import.meta.env.VITE_GOOGLE_ANALYTICS_ID as string | undefined;

/** GA 가 설정돼 로드됐는지. */
export const gaEnabled = Boolean(GA_ID);

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

/** gtag.js 스크립트를 한 번 삽입하고 기본 설정을 한다. 앱 부팅 시 1회 호출. */
export function initGa() {
  if (!GA_ID || typeof window === 'undefined') return;

  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  // gtag 는 arguments 객체를 그대로 dataLayer 에 넣는 규약이라 화살표 함수로 바꾸지 않는다.
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer.push(arguments);
  };
  window.gtag('js', new Date());
  // 초기 page_view 자동 전송은 끈다 — 라우트 트래킹에서 첫 진입 포함해 직접 보낸다(중복 방지).
  window.gtag('config', GA_ID, { send_page_view: false });
}

/**
 * SPA 라우트 이동마다 호출한다. 지금 화면을 page_view 로 보낸다.
 *
 * **page_location(전체 URL)을 싣는다.** GA4 는 페이지 경로도 호스트 이름도 이 값에서 뽑아 내므로,
 * UA 시절 파라미터인 page_path 만 보내면 리포트가 첫 진입 URL 에 머문 채로 남는다.
 * 호출 시점이 라우팅 직후라 window.location 은 이미 새 주소다.
 */
export function trackPageView() {
  if (!GA_ID || typeof window === 'undefined') return;
  window.gtag('event', 'page_view', {
    page_location: window.location.href,
    page_title: document.title,
  });
}
