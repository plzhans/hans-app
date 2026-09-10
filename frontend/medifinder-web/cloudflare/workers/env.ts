/**
 * 워커가 받는 바인딩과 변수.
 *
 * 이름을 프론트의 .env.<환경> 과 똑같이 쓴다. 줄여 쓰면 별명 매핑표가 하나 더 생기고,
 * `grep VITE_SITE_URL` 로 .env·화면·워커의 사용처가 한 번에 나오지 않는다.
 *
 * 워커 전용 값이 생기면 VITE_ 를 붙이지 않는다. 이 레포에서 그 접두사는 "브라우저 번들에
 * 그대로 노출되는 공개값" 을 뜻한다(frontend/.env.example).
 *
 * 값은 ci-deploy.sh 가 빌드와 같은 .env.<환경> 에서 읽어 --var 로 넘긴다.
 * wrangler.jsonc 의 vars 에 적지 않는다 — 진실이 둘이 되면, 어긋났을 때 워커가 401 을 받아
 * 화면은 멀쩡한 채로 SEO 만 죽는다.
 */
export interface Env {
  /** dist/ 의 정적 자산. wrangler.jsonc 의 assets.binding 이 만든다. */
  ASSETS: Fetcher;
  /** 예: https://medifinder.kr. canonical·og:url 의 기준이자 API 에 보낼 Origin 이다. */
  VITE_SITE_URL: string;
  /** 예: https://api.plzhans.com */
  VITE_HANSAPP_BASE_URL: string;
  /** 서버가 Origin 과 쌍으로 대조한다. 둘 중 하나만 맞으면 401 이다. */
  VITE_HANSAPP_CLIENT_ID: string;
}
