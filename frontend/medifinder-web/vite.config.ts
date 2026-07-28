import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';
import path from 'path';

/**
 * Sentry release 로 쓸 산출물 신원. **숫자 버전만으로는 어느 커밋인지 모른다.**
 * sha 는 CI 가 넣어 준다(GitHub Actions 는 GITHUB_SHA). 로컬 빌드면 'dev' 가 박혀서,
 * 이게 배포 산출물이 아니라는 사실이 Sentry 에서 그대로 드러난다.
 */
const pkg = JSON.parse(
  readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'),
) as { version: string };
const gitSha = (process.env.VITE_GIT_SHA ?? process.env.GITHUB_SHA ?? 'dev')
  .trim()
  .slice(0, 7);

export default defineConfig(({ mode }) => {
  console.log(`[vite] mode=${mode}  VITE_HANSAPP_BASE_URL=${process.env.VITE_HANSAPP_BASE_URL ?? '(not set)'}`);
  return {
    plugins: [react()],
    // 빌드 시점에 상수로 치환된다. Sentry release 문자열을 여기서 굳힌다.
    define: {
      __APP_RELEASE__: JSON.stringify(`${pkg.version}-${gitSha}`),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      host: true,

      /**
       * 포트를 못 박는다. 네이버 지도 키는 http://localhost:5173 **한 포트에만** 묶여 있어서,
       * vite 가 포트를 하나 밀어 5174 로 뜨면 지도가 인증 실패로 조용히 안 나온다.
       * 이미 5173 이 물려 있으면 다른 포트로 도망가지 말고 그냥 실패해라.
       */
      port: 5173,
      strictPort: true,
    },
    build: {
      outDir: 'dist',
    },
  };
});
