/**
 * `dist-server/entry-server.js` 는 `vite build --ssr` 산출물이라 타입 선언이 딸려 오지 않는다.
 * 인자·반환 모양은 양쪽이 같이 쓰는 계약(src/shared/ssr/contract.ts)에서 가져오므로,
 * entry-server 가 시그니처를 바꾸면 여기가 아니라 거기서 먼저 깨진다.
 *
 * 파일이 없으면 워커 빌드가 여기서 죽는다. 그게 맞다 — `pnpm build:bundles` 를 건너뛴
 * 배포는 본문을 못 그린다.
 */
declare module '*dist-server/entry-server.js' {
  export function renderHospital(
    opts: import('../../src/shared/ssr/contract').RenderHospitalInput,
  ): Promise<import('../../src/shared/ssr/contract').RenderResult>;

  export function renderHome(
    opts: import('../../src/shared/ssr/contract').RenderHomeInput,
  ): Promise<import('../../src/shared/ssr/contract').RenderResult>;

  /** 홈 여섯 섹션의 조회 경로. 순서가 renderHome 의 sections 순서다. */
  export const HOME_QUERY_PATHS: string[];
  /** 상세의 '근처의 비슷한 병원' 개수. 화면이 정한 값이다. */
  export const NEARBY_SIZE: number;
}
