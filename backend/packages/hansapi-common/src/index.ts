export const APP_NAME = 'hansapi';

export * from './localization/lang-text';
export * from './localization/accept-language';
export * from './location';
export * from './time-range';
export * from './env';
export * from './build-info';

/**
 * 목록 조회 공통 페이지 결과. 응용 계층 서비스가 반환하고,
 * server 계층은 이를 응답 DTO 형태로 매핑한다.
 */
export class Page<T> {
  readonly totalPages: number;

  constructor(
    readonly items: T[],
    readonly page: number,
    readonly size: number,
    readonly totalCount: number,
  ) {
    this.totalPages = size > 0 ? Math.ceil(totalCount / size) : 0;
  }
}
