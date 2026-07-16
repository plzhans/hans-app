import { defineConfig } from 'orval';

export default defineConfig({
  addrEng: {
    input: {
      target: './openapi/juso-addr-eng.json',
    },
    output: {
      mode: 'split',
      target: './src/generated/juso.ts',
      schemas: './src/generated/model',
      client: 'fetch',
      clean: true,
      prettier: true,
      override: {
        // confmKey·resultType 을 쿼리로 주입하고, errorCode 검사와 XML 에러 처리를 여기서 담당한다.
        mutator: {
          path: './src/mutator.ts',
          name: 'jusoMutator',
        },
      },
    },
  },
});
