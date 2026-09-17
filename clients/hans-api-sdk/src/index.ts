/**
 * Node 소비자(배치·CLI)용 진입점. 평범한 async 함수들이다.
 *
 * 브라우저에서 react-query 훅이 필요하면 `@hansapp/api-sdk/react` 를 쓴다.
 * **모델 타입은 두 진입점이 같은 것을 쓴다** — 한 스펙에서 한 번 생성되므로 어긋나지 않는다.
 */
export * from './http';
export * from './generated/model';
export * from './generated/fetch';
