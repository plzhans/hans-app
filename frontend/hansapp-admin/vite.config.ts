import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';
import path from 'path';

const pkg = JSON.parse(
  readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'),
) as { version: string };
const gitSha = (process.env.VITE_GIT_SHA ?? process.env.GITHUB_SHA ?? 'dev')
  .trim()
  .slice(0, 7);

export default defineConfig(({ mode }) => {
  console.log(
    `[vite] mode=${mode}  VITE_ADMIN_API_BASE_URL=${process.env.VITE_ADMIN_API_BASE_URL ?? '(not set)'}`,
  );
  return {
    plugins: [react()],
    define: {
      __APP_RELEASE__: JSON.stringify(`${pkg.version}-${gitSha}`),
    },
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
      dedupe: ['react', 'react-dom'],
    },
    server: {
      // **localhost 가 아니라 127.0.0.1 로 고정한다.** 쿠키는 호스트 기준이라
      // 둘을 섞으면 로그인은 되는데 새로고침하면 익명이 된다.
      host: '127.0.0.1',
      // 5273 auth · 5274 web 다음 자리. strictPort 라 겹치면 조용히 다른 포트로
      // 뜨지 않고 실패한다 — 포트가 밀리면 백엔드 CORS 목록과 어긋난다.
      port: 5275,
      strictPort: true,
      /*
        **프록시를 두지 않는다.**

        hansapp-web 은 인증웹(/auth)을 같은 오리진으로 프록시하는데, 관리자는 자체 로그인
        화면을 갖고 있어 인증웹으로 갈 일이 없다. 관리자 API 는 VITE_ADMIN_API_BASE_URL 로
        직접 부르고, 로컬에서 포트가 갈리는 동안은 admin-api 의
        apps-admin-api.cors.origins 가 이 오리진을 허용한다(배포에서는 같은 오리진이라
        CORS 자체가 꺼진다).
      */
    },
    build: { outDir: 'dist' },
  };
});
