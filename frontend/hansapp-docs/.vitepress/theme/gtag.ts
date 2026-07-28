/**
 * Google Analytics 4 (gtag.js).
 *
 * 측정 ID 는 **VITE_GOOGLE_ANALYTICS_ID** 환경변수로 주입한다(예: G-XXXXXXXXXX).
 * ID 가 없으면(로컬·미설정) 스크립트를 아예 로드하지 않는다 — 빈 ID 로 붙는 걸 막는다.
 * VitePress 는 SPA 라 초기 로드 외에는 URL 이 바뀌어도 페이지 로드가 없으므로,
 * 라우트 이동마다 {@link trackPageView} 로 page_view 를 직접 보낸다.
 *
 * (hansapp-web 의 src/shared/analytics/gtag.ts 와 같은 구현이다.)
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

/** SPA 라우트 이동마다 호출한다. 현재 경로를 page_view 로 보낸다. */
export function trackPageView(path: string) {
  if (!GA_ID || typeof window === 'undefined') return;
  window.gtag('config', GA_ID, { page_path: path });
}
