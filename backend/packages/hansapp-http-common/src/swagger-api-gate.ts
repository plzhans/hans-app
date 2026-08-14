import type { INestApplication } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import { DECORATORS } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';

import { API_CONTROLLER_KEY, INTERNAL_EXTENSION } from './api-controller.decorator';

/**
 * `@ApiController` / `@InternalApiController` 로 선언하지 않은 컨트롤러를 문서에서 통째로
 * 제외한다. **문서 생성의 제1조건이다** — SwaggerModule.createDocument 를 부르기 직전에 돈다.
 *
 * [왜 이게 제1조건이 되는가]
 * 스캐너는 클래스 제외 여부를 엔드포인트보다 **먼저** 보고, 걸리면 메서드를 쳐다보지도
 * 않는다(swagger-explorer 의 generateDenormalizedDocument). 그래서 여기서 걸린 클래스는
 * 안에 무엇이 붙어 있든 스펙에 닿지 못한다.
 *
 * [왜 새 판정을 만들지 않고 메타데이터를 심는가]
 * 심는 키는 `@ApiExcludeController` 가 쓰는 것과 같다. 사람이 손으로 단 것과 스캐너
 * 입장에서 완전히 동일해지므로, 우회로가 생길 여지가 없다.
 *
 * [왜 옵트아웃이 아니라 옵트인인가]
 * 새 컨트롤러가 문서에 나오려면 표식을 달아야 한다. 반대로 두면 웹 컨트롤러를 만들면서
 * 제외 데코레이터를 깜빡하는 순간 스펙이 샌다 — 사고의 방향이 중요하다.
 */
export function gateNonApiControllers(app: INestApplication): void {
  for (const module of app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const { metatype } = wrapper;
      if (!metatype) continue;
      if (Reflect.getMetadata(API_CONTROLLER_KEY, metatype)) continue;
      Reflect.defineMetadata(DECORATORS.API_EXCLUDE_CONTROLLER, [true], metatype);
    }
  }
}

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const;

/** 내부 전용 오퍼레이션의 태그에 붙는 접미사. `users` → `users.internal` */
const INTERNAL_TAG_SUFFIX = '.internal';

/**
 * 내부 전용 오퍼레이션을 `<태그>.internal` 로 옮긴다. createDocument **뒤에** 돈다.
 *
 * [왜 오퍼레이션마다 표시하지 않는가]
 * summary 에 `(Internal)` 을 붙여 봤더니 대부분이 순수 반복이었다 — 컨트롤러가 통째로 내부인
 * 경우가 많아 섹션을 열면 모든 줄에 같은 표식이 달렸다. 섹션을 가르면 표식 자체가 필요 없다.
 *
 * [왜 태그를 바꾸는 것으로 충분한가]
 * 컨트롤러 통째(@InternalApiController)든 함수 하나(@InternalApiEndpoint)든 x-internal 은
 * 오퍼레이션에 실린다(클래스에 건 ApiExtension 이 라우트 메서드 전부로 퍼진다). 그래서 판정
 * 지점이 하나로 통일되고, 섞인 컨트롤러도 `users` / `users.internal` 로 저절로 갈린다.
 *
 * 대외 문서에서는 아무 일도 하지 않는다 — 그때는 이 오퍼레이션들이 애초에 문서에 없다.
 */
export function retagInternalOperations(document: OpenAPIObject): void {
  for (const pathItem of Object.values(document.paths)) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;
      // 벤더 확장은 OperationObject 타입에 없다(색인 시그니처가 없어 직접 캐스팅도 막힌다).
      if ((operation as unknown as Record<string, unknown>)[INTERNAL_EXTENSION] !== true) continue;
      operation.tags = (operation.tags ?? []).map((tag) => `${tag}${INTERNAL_TAG_SUFFIX}`);
    }
  }
}
