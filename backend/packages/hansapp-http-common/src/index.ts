/**
 * HTTP 서버 앱이 공유하는 배선 조각.
 *
 * **여기 있는 것은 전부 "응답의 모양" 이나 "요청의 해석" 을 정한다.** 앱마다 복사해 두면
 * 오류 응답 형태나 IP 판별 규칙이 조용히 갈라지고, 그 차이는 프론트가 먼저 밟는다.
 * 그래서 앱(apps/*)이 아니라 패키지에 둔다.
 */
export { HttpErrorFilter } from './http-error.filter';
export { requestIdMiddleware, REQUEST_ID_HEADER } from './request-id.middleware';
export type { RequestWithId } from './request-id.middleware';
export { resolveClientIp } from './client-ip';
export { StripNullInterceptor } from './strip-null.interceptor';

// 목록 응답의 모양. 앱마다 따로 두면 프론트가 앱마다 다른 페이징 필드를 다루게 된다.
export { PageResponseDto } from './page.response.dto';
export { ApiPageResponse } from './api-page-response.decorator';
// enum 필드 한 줄(문서·변환·검증). 응답 변환은 ClassSerializerInterceptor 가 실행한다.
export { EnumField } from './enum-field.decorator';
