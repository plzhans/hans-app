import { defineConfig } from 'orval';

// 원본(Swagger 2.0)은 openapi/origin/ 에 보관하고, orval 은 정제한 OpenAPI 3.0 을 소비한다.
// serviceKey 주입·status_code 검사·XML 에러 처리는 mutator 가 담당한다.
export default defineConfig({
  ntsBusinessman: {
    input: {
      target: './openapi/nts-businessman.json',
    },
    output: {
      mode: 'split',
      target: './src/generated/nts.ts',
      schemas: './src/generated/model',
      client: 'fetch',
      clean: true,
      prettier: true,
      override: {
        mutator: {
          path: './src/mutator.ts',
          name: 'ntsMutator',
        },
      },
    },
  },
});
