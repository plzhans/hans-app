/**
 * 조회 소스.
 *
 *  - db     : 로컬 미러 테이블을 읽는다. 기본값. 콜수 제한이 없고 빠르다.
 *  - origin : 공공데이터 API 를 직접 때린다. 최신값 확인이나 적재 전 검증용이다.
 *
 * 어느 쪽이든 **원본 API 와 같은 타입**(openapi 에서 생성된 응답 타입)으로 돌려준다.
 * 소스가 바뀌어도 호출부의 결과 처리 코드가 달라지지 않는다.
 */
export const DATA_SOURCES = ['db', 'origin'] as const;
export type DataSource = (typeof DATA_SOURCES)[number];
