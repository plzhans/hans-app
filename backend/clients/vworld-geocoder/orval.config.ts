import { defineConfig } from 'orval';

// 주소→좌표(GetCoord)와 좌표→주소(GetAddress)가 **같은 경로·같은 메서드**를 쓰고
// request 파라미터로만 갈린다. OpenAPI 는 같은 path+method 를 두 번 정의할 수 없어
// 오퍼레이션마다 스펙 파일을 나눴다. (@krdata/hira 가 서비스 그룹별로 나눈 것과 같은 방식)
//
// 인증키·service·request·version·format 주입과 status 검사는 mutator 가 담당한다.
const mutator = {
  path: './src/mutator.ts',
  name: 'vworldMutator',
} as const;

export default defineConfig({
  coord: {
    input: { target: './openapi/geocoder-coord.json' },
    output: {
      mode: 'split',
      target: './src/generated/coord/coord.ts',
      schemas: './src/generated/coord/model',
      client: 'fetch',
      clean: true,
      prettier: true,
      override: { mutator },
    },
  },
  address: {
    input: { target: './openapi/geocoder-address.json' },
    output: {
      mode: 'split',
      target: './src/generated/address/address.ts',
      schemas: './src/generated/address/model',
      client: 'fetch',
      clean: true,
      prettier: true,
      override: { mutator },
    },
  },
});
