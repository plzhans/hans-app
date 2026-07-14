import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import type { OpenAPIObject } from '@nestjs/swagger';

/**
 * 공공데이터 SDK 의 openapi 스펙을 서버 문서에 합쳐 넣는다.
 *
 * nmc/hira 응답은 원본 API 와 같은 구조를 그대로 돌려준다. 그 구조와 필드 설명은
 * 우리가 소유한 스펙(clients 하위 krdata 패키지의 openapi 문서)에 이미 다 적혀 있으므로,
 * DTO 클래스를 수십 개 새로 만들지 않고 그 스키마를 재사용한다.
 *
 * 스펙을 고치면 SDK 타입과 서버 문서가 함께 따라온다. 두 벌로 관리하지 않는다.
 */

/** 제공기관별 스펙과 스키마 이름 접두사. 접두사가 없으면 이름이 충돌한다(양쪽에 HospitalListResponse 가 있다). */
const SPECS = [
  { pkg: '@krdata/nmc', file: 'openapi/nmc.json', prefix: 'Nmc' },
  { pkg: '@krdata/hira', file: 'openapi/hira.json', prefix: 'Hira' },
] as const;

interface OpenApiSpec {
  components?: { schemas?: Record<string, unknown> };
}

/** 패키지의 openapi 파일 경로를 찾는다. package.json 위치에서 역산한다. */
function specPath(pkg: string, file: string): string {
  const require = createRequire(__filename);
  const packageJson = require.resolve(`${pkg}/package.json`);
  return resolve(dirname(packageJson), file);
}

/**
 * 스키마 이름과 내부 $ref 에 접두사를 붙인다.
 * 원본: "#/components/schemas/HospitalListItem" → "#/components/schemas/NmcHospitalListItem"
 */
function prefixRefs(value: unknown, prefix: string): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => prefixRefs(entry, prefix));
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === '$ref' && typeof child === 'string') {
      result[key] = child.replace(
        '#/components/schemas/',
        `#/components/schemas/${prefix}`,
      );
      continue;
    }
    result[key] = prefixRefs(child, prefix);
  }
  return result;
}

/** 서버 OpenAPI 문서에 SDK 스펙의 components.schemas 를 병합한다. */
export function mergeKrDataSchemas(document: OpenAPIObject): OpenAPIObject {
  document.components ??= {};
  document.components.schemas ??= {};

  for (const { pkg, file, prefix } of SPECS) {
    const spec = JSON.parse(
      readFileSync(specPath(pkg, file), 'utf-8'),
    ) as OpenApiSpec;

    for (const [name, schema] of Object.entries(
      spec.components?.schemas ?? {},
    )) {
      document.components.schemas[`${prefix}${name}`] = prefixRefs(
        schema,
        prefix,
      ) as never;
    }
  }

  return document;
}

/** 병합된 스키마를 $ref 로 가리킨다. 컨트롤러의 @ApiOkResponse 에서 쓴다. */
export function krDataSchemaRef(name: string): { $ref: string } {
  return { $ref: `#/components/schemas/${name}` };
}
