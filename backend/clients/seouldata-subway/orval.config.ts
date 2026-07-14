import { defineConfig } from 'orval';

export default defineConfig({
  subway: {
    input: {
      target: './openapi/subway.json',
    },
    output: {
      mode: 'split',
      target: './src/generated/subway.ts',
      schemas: './src/generated/model',
      client: 'fetch',
      clean: true,
      prettier: true,
      override: {
        // 인증키를 경로에 주입하고, RESULT.CODE 검사와 XML 에러 처리를 여기서 담당한다.
        mutator: {
          path: './src/mutator.ts',
          name: 'seoulDataMutator',
        },
      },
    },
  },
});
