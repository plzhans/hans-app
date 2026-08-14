import { applyDecorators, Controller, SetMetadata } from '@nestjs/common';
import type { ControllerOptions } from '@nestjs/common';
import { ApiExcludeController, ApiExcludeEndpoint, ApiExtension } from '@nestjs/swagger';

/**
 * REST API 컨트롤러임을 나타내는 표식. 문서 생성이 이 키를 보고 대상을 고른다.
 * gateNonApiControllers 가 유일한 소비자다.
 */
export const API_CONTROLLER_KEY = 'hansapp/apiController';

/**
 * 내부 전용 오퍼레이션에 붙는 벤더 확장. 문서를 켠 사람이 공개 API 와 구분할 수 있어야 한다.
 * markInternalOperations 가 이걸 보고 summary 에 표식을 단다.
 */
export const INTERNAL_EXTENSION = 'x-internal';

/**
 * 내부 전용 API 를 문서에 실을지.
 *
 * **데코레이터는 모듈 import 시점에 평가된다.** 그래서 yaml(appConfig)이 아니라 process.env
 * 를 직접 본다 — 서버는 boot-config 가 첫 import 체인에서 dotenv 를 읽으므로 env 파일 값이
 * 제때 올라와 있고, 개인 오버라이드(config/.env.<환경>.local)로 켜는 것을 의도한 경로로 둔다.
 *
 * **production 에서는 어떤 경우에도 켜지지 않는다.** 그 밖(local·develop)은 개발자가 자기
 * 머신에서 띄우는 자리라 연다 — hansapp-api 는 APP_ENV=develop 으로만 뜨기 때문에 local 로
 * 잠그면 기능 자체를 쓸 수 없다.
 *
 * 배포된 develop 서버까지 열리지는 않는다. 켜는 파일(.env.develop.local)이 커밋되지 않아
 * 컨테이너에는 존재하지 않기 때문이다. 반대로 말하면 **커밋되는 env 파일에는 절대 넣지 않는다.**
 */
export const SHOW_INTERNAL_API =
  process.env.APP_ENV !== 'production' && process.env.OPENAPI_INTERNAL === 'true';

/**
 * Controller 의 오버로드를 그대로 옮긴다. Parameters<typeof Controller> 로 위임하면
 * 마지막 오버로드(ControllerOptions)만 잡혀서 문자열 경로가 타입 에러가 난다.
 */
type ControllerPrefix = string | string[] | ControllerOptions;

/**
 * **REST API 컨트롤러 선언.** Nest 의 `@Controller` 를 대신하며 인자도 그대로 받는다.
 *
 * OpenAPI 문서에는 **이 데코레이터로 선언한 클래스만** 실린다. 서버사이드 렌더링이나
 * 리다이렉트 같은 웹 컨트롤러는 Nest 기본 `@Controller` 를 쓰면 그것으로 끝이다 —
 * 빠뜨려서 새는 게 아니라, 빠뜨리면 안 나온다.
 *
 * 스프링의 `@RestController` / `@Controller` 와 같은 자리다. 선언하는 순간 분류가
 * 끝나므로 "컨트롤러는 만들었는데 분류 표시를 깜빡한" 상태가 존재하지 않는다.
 */
export function ApiController(): ClassDecorator;
export function ApiController(prefix: string | string[]): ClassDecorator;
export function ApiController(options: ControllerOptions): ClassDecorator;
export function ApiController(prefix?: ControllerPrefix): ClassDecorator {
  // Controller 는 인자가 undefined 여도 정상 처리한다(경로 '/').
  return applyDecorators(SetMetadata(API_CONTROLLER_KEY, true), Controller(prefix as never));
}

/**
 * **내부 전용 API 컨트롤러 선언.** ApiController 와 같지만 대외 스펙에서 빠진다.
 *
 * 우리 프론트(인증웹·개발자 콘솔)만 부르는 자리에 쓴다. API 인 것은 맞으므로 표식은
 * 달고, 문서 노출만 OPENAPI_INTERNAL 로 여닫는다 — 개발 중에는 보고 싶은 것들이다.
 */
export function InternalApiController(): ClassDecorator;
export function InternalApiController(prefix: string | string[]): ClassDecorator;
export function InternalApiController(options: ControllerOptions): ClassDecorator;
export function InternalApiController(prefix?: ControllerPrefix): ClassDecorator {
  return applyDecorators(
    SetMetadata(API_CONTROLLER_KEY, true),
    Controller(prefix as never),
    // disable=false 면 스캐너가 걸러내지 않는다. 즉 켜면 문서에 나온다.
    ApiExcludeController(!SHOW_INTERNAL_API),
    // 클래스에 걸면 이 컨트롤러의 라우트 메서드 전부에 퍼진다.
    ApiExtension(INTERNAL_EXTENSION, true),
  );
}

/**
 * **내부 전용 엔드포인트.** 컨트롤러는 대외 공개인데 특정 함수만 우리 프론트용일 때 쓴다.
 * 무조건 감추려면 Nest 의 `@ApiExcludeEndpoint()` 를 그대로 쓴다.
 */
export const InternalApiEndpoint = (): MethodDecorator =>
  applyDecorators(ApiExcludeEndpoint(!SHOW_INTERNAL_API), ApiExtension(INTERNAL_EXTENSION, true));
