/**
 * HTTP 서버 앱이 공유하는 배선 조각.
 *
 * **여기 있는 것은 전부 "응답의 모양" 이나 "요청의 해석" 을 정한다.** 앱마다 복사해 두면
 * 오류 응답 형태나 IP 판별 규칙이 조용히 갈라지고, 그 차이는 프론트가 먼저 밟는다.
 * 그래서 앱(apps/*)이 아니라 패키지에 둔다.
 */
export { HttpErrorFilter } from './http-error.filter';
// 부팅에서 죽었을 때 Sentry 로 알린다. 전역 필터가 서기 전이라 필터가 못 잡는 자리다.
export { reportBootFailure } from './boot-failure';
export { requestIdMiddleware, REQUEST_ID_HEADER } from './request-id.middleware';
export type { RequestWithId } from './request-id.middleware';
export { resolveClientIp } from './client-ip';
export { StripNullInterceptor } from './strip-null.interceptor';

// 목록 응답의 모양. 앱마다 따로 두면 프론트가 앱마다 다른 페이징 필드를 다루게 된다.
export { PageResponseDto } from './page.response.dto';
export { ApiPageResponse } from './api-page-response.decorator';
// enum 필드 한 줄(문서·변환·검증). 응답 변환은 ClassSerializerInterceptor 가 실행한다.
export { EnumField } from './enum-field.decorator';

// 컨트롤러 선언과 문서 노출 범위. 앱마다 규칙이 갈리면 "왜 저쪽만 나오지" 가 된다.
export {
  ApiController,
  InternalApiController,
  InternalApiEndpoint,
  API_CONTROLLER_KEY,
  INTERNAL_EXTENSION,
  SHOW_INTERNAL_API,
} from './api-controller.decorator';
export { gateNonApiControllers, retagInternalOperations } from './swagger-api-gate';
// Swagger UI 섹션 정렬자. 브라우저로 실려 나가므로 자기 완결이어야 한다(파일 주석 참고).
export { swaggerTagsSorter, adminSwaggerTagsSorter } from './swagger-tags-sorter';
