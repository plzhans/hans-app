import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// 빌드 시 사용할 OpenAPI 스펙 경로.
// 기본값: 레포 루트 docs/openapi/openapi_hansapi.json (문서 프로젝트 기준 ../../docs/...)
// CI 등에서 OPENAPI_SPEC 환경변수로 덮어쓸 수 있다(환경별 스펙 지정).
//
// 경로는 실행 위치(cwd = 문서 프로젝트 루트)를 기준으로 해석한다.
// vitepress 가 config/paths 파일을 임시 위치로 번들해 실행하므로
// __dirname/import.meta.url 대신 cwd 로 앵커링하는 것이 안전하다.
export const specPath: string = resolve(
  process.cwd(),
  process.env.OPENAPI_SPEC ?? '../../docs/openapi/openapi_hansapi.json',
);

/** 스펙 파일을 읽어 파싱한다(Node 빌드 컨텍스트 전용). */
export function loadSpec(): Record<string, unknown> {
  return JSON.parse(readFileSync(specPath, 'utf-8'));
}
