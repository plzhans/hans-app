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

/*
  **이 산출물을 언제 구웠나.** 버전과 sha 만으로는 "지금 뜬 화면이 방금 올린 그것인가" 를
  못 가린다 — 같은 커밋을 두 번 배포하면 값이 똑같아서, 결국 커밋 시각을 찾아보게 된다.

  UTC(ISO)로 굽고 펴는 것은 화면이 한다(백엔드 build-info.json 의 builtAt 과 같은 방식).
  개발 서버로 띄우면 이 값은 **dev server 를 켠 시각**이다 — 파일을 고쳐도 갱신되지 않는다.
*/
const builtAt = new Date().toISOString();

export default defineConfig(({ mode }) => {
  console.log(
    `[vite] mode=${mode}  VITE_ADMIN_API_BASE_URL=${process.env.VITE_ADMIN_API_BASE_URL ?? '(not set)'}`,
  );
  return {
    plugins: [react()],
    define: {
      __APP_RELEASE__: JSON.stringify(`${pkg.version}-${gitSha}`),
      __APP_BUILT_AT__: JSON.stringify(builtAt),
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
