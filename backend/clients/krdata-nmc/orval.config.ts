import { defineConfig } from 'orval';

export default defineConfig({
  nmc: {
    input: {
      target: './openapi/nmc.json',
    },
    output: {
      mode: 'split',
      target: './src/generated/nmc.ts',
      schemas: './src/generated/model',
      client: 'fetch',
      clean: true,
      prettier: true,
      override: {
        // ServiceKey 주입, 재시도, XML 에러 처리, items 정규화를 모두 여기서 담당한다.
        mutator: {
          path: './src/mutator.ts',
          name: 'krDataMutator',
        },
      },
    },
  },
});
