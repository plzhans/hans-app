import { defineConfig } from 'orval';

// 정부포털(data.go.kr)은 서비스 그룹 단위로 스펙을 개정·배포한다.
// 그래서 스펙도 그룹별 파일(openapi/B551182/*.json)로 나눠 두고, 한 서비스만
// 독립적으로 재동기화할 수 있게 한다. 원본(Swagger 2.0)은 openapi/B551182/orgin/ 에 보관.
// 자세한 배경은 README.md 참고.
//
// ServiceKey 주입·재시도·XML 에러 처리·items 정규화는 모든 타깃이 mutator 로 공유한다.
const mutator = {
  path: './src/mutator.ts',
  name: 'krDataMutator',
} as const;

export default defineConfig({
  hospInfo: {
    input: { target: './openapi/B551182/hospInfoServicev2.json' },
    output: {
      mode: 'split',
      target: './src/generated/hosp-info/hosp-info.ts',
      schemas: './src/generated/hosp-info/model',
      client: 'fetch',
      clean: true,
      prettier: true,
      override: { mutator },
    },
  },
  codeInfo: {
    input: { target: './openapi/B551182/codeInfoService.json' },
    output: {
      mode: 'split',
      target: './src/generated/code-info/code-info.ts',
      schemas: './src/generated/code-info/model',
      client: 'fetch',
      clean: true,
      prettier: true,
      override: { mutator },
    },
  },
  madmDtl: {
    // 파일명은 메이저 버전(2)까지만. 마이너 버전(2.8 등)은 스펙 내부 경로와
    // mutator 의 SPEC_DETAIL_VERSION 으로만 관리해, 버전이 올라도 파일명·설정·코드
    // 구조는 그대로 둔다. detailVersion 설정으로 런타임에 경로가 스왑된다.
    input: { target: './openapi/B551182/MadmDtlInfoService2.json' },
    output: {
      mode: 'split',
      target: './src/generated/madm-dtl/madm-dtl.ts',
      schemas: './src/generated/madm-dtl/model',
      client: 'fetch',
      clean: true,
      prettier: true,
      override: { mutator },
    },
  },
});
