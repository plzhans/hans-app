import { defineConfig } from 'orval';

/**
 * hansapi-server OpenAPI → React 클라이언트 SDK 자동 생성 설정.
 *
 * 스펙(../../docs/openapi/openapi_hansapi.json)에서 react-query 훅을 생성한다.
 * 인증/언어 헤더는 생성 코드가 아니라 mutator(src/shared/api/mutator.ts)에서 주입한다.
 *
 * 스펙 갱신 → 재생성: `pnpm api:sync` (spec 재생성 + orval 재실행).
 */
const INPUT = '../../docs/openapi/openapi_hansapi.json';

export default defineConfig({
  react: {
    // 백엔드 스펙의 securitySchemes.bearer.example 은 OpenAPI 표준상 위치가
    // 어긋나 있어 orval 검증에서 막힌다. 코드 생성에는 영향이 없어 검증만 끈다.
    input: { target: INPUT, unsafeDisableValidation: true },
    output: {
      mode: 'tags-split',
      target: 'src/shared/api/generated/react',
      schemas: 'src/shared/api/generated/model',
      client: 'react-query',
      httpClient: 'fetch',
      clean: true,
      prettier: true,
      override: {
        mutator: {
          path: 'src/shared/api/mutator.ts',
          name: 'reactFetch',
        },
        query: {
          useQuery: true,
        },
        // 훅의 data 가 곧 응답 본문이 되도록 status/headers 래핑을 끈다.
        // (mutator 는 순수 payload 를 반환한다 → query.data 로 바로 접근)
        fetch: {
          includeHttpResponseReturnType: false,
        },
      },
    },
  },
});
