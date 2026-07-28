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
  console.log(
    `[vite] mode=${mode}  VITE_HANSAPI_BASE_URL=${process.env.VITE_HANSAPI_BASE_URL ?? '(not set)'}`,
  );
  return {
    plugins: [react()],
    // 빌드 시점에 상수로 치환된다. Sentry release 문자열을 여기서 굳힌다.
    define: {
      __APP_RELEASE__: JSON.stringify(`${pkg.version}-${gitSha}`),
    },
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
    server: {
      // 127.0.0.1 로 고정한다(localhost 로 새지 않게). API 가 127.0.0.1:3000 이라, 쿠키(호스트 기준)가
      // 프론트↔API 사이에 흐르려면 프론트도 같은 호스트여야 한다. localhost 와 127.0.0.1 은 서로 다른 호스트다.
      host: '127.0.0.1',
      // 콘솔 전용 포트(포털 hansapp-auth 5273, medifinder 5173 과 겹치지 않게 5274).
      port: 5274,
      strictPort: true,
      // 단일 오리진 로컬: 이 콘솔(hans-app)이 front door. /auth/* 는 로그인 포털(hansapp-auth 5273)로 프록시.
      //   http://127.0.0.1:5274/           → 콘솔
      //   http://127.0.0.1:5274/auth/login → 포털 (base=/auth/)
      proxy: {
        '/auth': { target: 'http://127.0.0.1:5273', changeOrigin: true },
      },
    },
    build: { outDir: 'dist' },
  };
});
