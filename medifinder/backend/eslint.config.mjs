// @ts-check
// medifinder 서버측 패키지 공통 ESLint 설정. hansapp 의 backend/eslint.config.mjs 와 같은 자리다.
//
// **backend/eslint.config.mjs 의 축소판이다.** 옮겨오면서 필요 없어진 것을 뺐다 —
// prisma 생성물 무시 규칙(DB 를 안 쓴다), @hansapp/* 금지 규칙(워크스페이스가 다르니
// 애초에 해석되지 않는다). 그 규칙이 하던 일을 이제 디렉터리 구조가 한다.
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: { ...globals.node },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
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
        **await 결과에 바로 `.` 을 붙이지 못하게 한다.** backend 와 같은 규칙이다 —
        한 줄에서 "기다린다" 와 "변환한다" 를 동시에 붙잡아야 해서 읽는 순서가 뒤집힌다.
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
