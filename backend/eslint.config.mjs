// @ts-check
// backend 모노레포 공통 ESLint 설정 (apps/*, packages/*, clients/* 전체에 적용)
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // 린트 제외 대상
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/*.config.mjs', // eslint.config.mjs 등 설정 파일 자체
      // orval.config.ts 는 각 client 의 tsconfig include("src") 밖이라
      // 타입 기반 린트(projectService)가 파싱하지 못한다. 설정 파일이므로 제외한다.
      '**/orval.config.ts',
      // 같은 이유. 일회성 빌드 스크립트라 tsconfig include("src") 밖이고,
      // 패키지에 담겨 배포되지도 않는다.
      'packages/*/scripts/**',
      // 같은 이유. pm2 구성(ecosystem.config.cjs)은 우리 코드가 아니라 **서버에 올리는 설정**이다.
      // tsconfig 밖이라 타입 기반 린트가 파싱하지 못한다.
      'infra/**',
      'docs/temp/**', // 참고용 응답 예시. 빌드에 안 들어가고 tsconfig 밖이다.
      '**/prisma/**', // prisma 스키마/생성 코드
      '**/src/generated/**', // orval 이 생성한 API 클라이언트 코드
      '**/generated/**', // prisma 가 생성한 클라이언트
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        // 각 파일에 맞는 tsconfig 를 자동 탐색 → apps/*, packages/* 모두 대응
        projectService: true,
        // tsconfig 탐색 기준 루트 = backend
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
    },
  },
);
