import { defineConfig } from 'orval';

// 게이트웨이(1741000) 아래 서비스 단위로 스펙을 나눠 둔다. @krdata/hira 와 같은 규칙이다.
// 원본 활용가이드(docx)는 openapi/1741000/origin/ 에 보관한다.
//
// ServiceKey·type 주입, 재시도, 봉투 판정은 mutator 가 담당한다.
export default defineConfig({
  stanReginCd: {
    input: {
      target: './openapi/1741000/StanReginCd.json',
    },
    output: {
      mode: 'split',
      target: './src/generated/stan-regin-cd/stan-regin-cd.ts',
      schemas: './src/generated/stan-regin-cd/model',
      client: 'fetch',
      clean: true,
      prettier: true,
      override: {
        mutator: {
          path: './src/mutator.ts',
          name: 'krDataMutator',
        },
      },
    },
  },
});
