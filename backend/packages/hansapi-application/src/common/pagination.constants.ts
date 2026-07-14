/**
 * 페이지네이션 기본 정책. 응용(command) 계층이 소유하며,
 * 각 Command 의 기본값과 전송 계층 DTO 의 검증/문서값이 이 상수를 공유한다.
 */
export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MIN_PAGE_SIZE = 1;
export const MAX_PAGE_SIZE = 100;
