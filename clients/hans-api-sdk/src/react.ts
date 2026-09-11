/**
 * 브라우저 소비자용 진입점. react-query 훅이다.
 *
 * 훅과 함께 평범한 함수도 나온다(orval 이 둘을 같이 낸다) — 렌더 밖에서 불러야 할 때 쓴다.
 * 모델 타입은 기본 진입점(`@hans-api/sdk`)과 같은 것이다.
 *
 * @tanstack/react-query 가 필요하다. 선택적 peer 이므로 이 진입점을 쓰는 쪽만 설치하면 된다.
 */
export * from './http';
export * from './generated/model';
export * from './generated/react';
