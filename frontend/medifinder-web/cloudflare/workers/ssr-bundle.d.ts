/**
 * `dist-server/entry-server.js` 는 `vite build --ssr` 산출물이라 타입 선언이 딸려 오지 않는다.
 * 원본의 시그니처를 그대로 빌려 온다 — 손으로 베껴 적으면 원본이 바뀔 때 조용히 갈린다.
 *
 * 파일이 없으면 워커 빌드가 여기서 죽는다. 그게 맞다 — `pnpm build:bundles` 를 건너뛴
 * 배포는 상세 페이지를 못 그린다.
 */
declare module '*dist-server/entry-server.js' {
  export const renderHospital: typeof import('../../src/entry-server').renderHospital;
  export type RenderResult = import('../../src/entry-server').RenderResult;
}
