import { defineConfig } from 'orval';

/**
 * hans-api OpenAPI → 클라이언트 SDK.
 *
 * **타깃이 둘이지만 패키지는 하나다.** 브라우저는 react-query 훅이 필요하고 Node 는 평범한
 * 함수가 필요한데, 그 차이 때문에 예전에는 SDK 자체가 두 벌로 갈라져 있었다. 그러면 같은
 * 스펙에서 나온 두 클라이언트가 각자 재생성되면서 조용히 어긋난다(실제로 0.13.0 / 0.15.0 /
 * 0.17.0 세 갈래가 됐다).
 *
 * 한 패키지 안에 두 타깃을 두고 **schemas 를 같은 디렉터리로** 모으면, 모델 타입은 한 벌이
 * 되고 재생성도 한 명령이다. 두 진입점이 어긋날 방법이 없다.
 *
 * 인증·기준 주소는 생성 코드가 모른다 — src/http.ts 가 주입점이다.
 */
const INPUT = {
  target: '../../docs/openapi/hansapp-openapi.json',
  // 스펙의 securitySchemes.bearer.example 이 OpenAPI 표준상 위치가 어긋나 검증에서 막힌다.
  // 코드 생성에는 영향이 없어 검증만 끈다.
  unsafeDisableValidation: true,
} as const;

const MUTATOR = { path: 'src/http.ts', name: 'hansApiFetch' } as const;

export default defineConfig({
  // Node 소비자(배치·CLI)가 쓰는 평범한 함수.
  fetch: {
    input: INPUT,
    output: {
      mode: 'tags-split',
      target: 'src/generated/fetch',
      schemas: 'src/generated/model',
      client: 'fetch',
      clean: true,
      prettier: true,
      override: {
        mutator: MUTATOR,
        // 반환값이 곧 응답 본문이 되도록 status/headers 래핑을 끈다.
        fetch: { includeHttpResponseReturnType: false },
      },
    },
  },

  /*
    브라우저 소비자가 쓰는 react-query 훅.

    **clean 을 끈다.** 위 타깃과 schemas 디렉터리를 공유하므로, 켜 두면 방금 만든 모델을
    지우고 다시 만드는 일이 회차마다 벌어진다. 타깃 디렉터리는 아래 api:gen 이 통째로
    비우고 시작하므로 낡은 파일이 남지도 않는다.
  */
  react: {
    input: INPUT,
    output: {
      mode: 'tags-split',
      target: 'src/generated/react',
      schemas: 'src/generated/model',
      client: 'react-query',
      httpClient: 'fetch',
      clean: false,
      prettier: true,
      override: {
        mutator: MUTATOR,
        query: { useQuery: true },
        fetch: { includeHttpResponseReturnType: false },
      },
    },
  },
});
