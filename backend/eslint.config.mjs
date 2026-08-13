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
      'scripts/**', // 워크스페이스 공용 빌드 스크립트(build-info.mjs 등). 같은 이유.
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
      /*
        **await 결과에 바로 `.` 을 붙이지 못하게 한다.**

        `(await this.boards.list()).map(...)` 는 읽는 순서가 뒤집힌다 — 눈이 먼저 만나는
        것은 괄호 안의 기다림이고, 이 줄이 무엇을 하는지(.map)는 괄호를 닫은 뒤에야
        나온다. 한 줄에서 "기다린다" 와 "변환한다" 를 동시에 붙잡아야 한다.

        결과를 변수로 받으면 순서가 제자리로 오고 이름도 하나 생긴다.
          const boards = await this.boards.list();
          return boards.map(...);

        `toDto(await x)` 처럼 감싸는 것은 막지 않는다 — 그쪽은 왼쪽부터 읽힌다.
      */
      'no-restricted-syntax': [
        'error',
        {
          selector: 'MemberExpression > AwaitExpression.object',
          message: 'await 결과에 바로 . 을 붙이지 말 것. 변수로 받은 뒤 쓰면 읽는 순서가 맞는다.',
        },
      ],
    },
  },
);
