/**
 * 워커가 받는 바인딩과 변수.
 *
 * **이름을 프론트의 .env.<환경> 과 똑같이 쓴다.** 워커용으로 SITE_URL 처럼 줄여 쓰면
 * `SITE_URL ← VITE_SITE_URL` 이라는 매핑을 어딘가에 적어 둬야 하고, 값을 하나 늘릴 때마다
 * 그 별명을 기억해야 한다 — 매핑표가 곧 틀릴 수 있는 자리다. 같은 이름을 쓰면
 * `grep VITE_SITE_URL` 하나로 .env·화면·워커의 모든 사용처가 한 번에 나온다.
 *
 * **VITE_ 접두사가 워커에서도 거짓말이 아니다.** 이 레포에서 그 접두사는 "공개값이며
 * 브라우저 번들에 그대로 노출된다"는 뜻인데(frontend/.env.example 참고), 워커가 쓰는 것도
 * 정확히 그 공개값이다.
 *
 * **다만 워커 전용 값이 생기면 VITE_ 를 붙이지 않는다.** 그래야 접두사가 계속
 * "브라우저에 노출됨" 을 뜻한다 — 워커에만 있는 시크릿에 그 이름을 붙이면 그 뜻이 무너진다.
 *
 * 값은 ci-deploy.sh 가 빌드가 읽는 **같은 .env.<환경> 파일**에서 읽어 --var 로 넘긴다.
 * wrangler.jsonc 의 vars 에 적지 않는다 — 그러면 진실이 둘이 되고, 어긋나면 워커가 401 을
 * 받아 화면은 멀쩡한 채로 SEO 만 죽는다.
 */
export interface Env {
  /** dist/ 의 정적 자산. wrangler.jsonc 의 assets.binding 이 만든다. */
  ASSETS: Fetcher;
  /** 예: https://medifinder.kr. canonical·og:url 의 기준이자 API 에 보낼 Origin 이다. */
  VITE_SITE_URL: string;
  /** 예: https://api.plzhans.com */
  VITE_HANSAPP_BASE_URL: string;
  /** 서버가 Origin 과 **쌍으로** 대조한다. 둘 중 하나만 맞으면 401 이다. */
  VITE_HANSAPP_CLIENT_ID: string;
}
