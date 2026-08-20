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

/*
  **이 산출물을 언제 구웠나.** 버전과 sha 만으로는 "지금 뜬 화면이 방금 올린 그것인가" 를
  못 가린다 — 같은 커밋을 두 번 배포하면 값이 똑같아서, 결국 커밋 시각을 뒤지게 된다.

  UTC(ISO)로 굽고 펴는 것은 화면이 한다(백엔드 build-info.json 의 builtAt 과 같은 방식).
  개발 서버로 띄우면 이 값은 **dev server 를 켠 시각**이다 — 파일을 고쳐도 갱신되지 않는다.
*/
const builtAt = new Date().toISOString();

export default defineConfig(({ mode }) => {
  console.log(
    `[vite] mode=${mode}  VITE_HANSAPP_BASE_URL=${process.env.VITE_HANSAPP_BASE_URL ?? '(not set)'}`,
  );

  /*
    검색 색인은 **운영 빌드에서만** 연다. develop 도메인(develop.plzhans.com)이 그대로
    공개돼 있어, 열어 두면 운영과 같은 내용이 두 주소로 색인된다.

    **vite 의 mode 로 판별하면 안 된다.** package.json 의 build:develop 은
    `dotenv -e .env.develop -- vite build` 라 --mode 를 주지 않는다. 그래서 develop 빌드에서도
    mode 는 'production' 이고, 환경 구분은 dotenv 가 넣어 준 VITE_APP_ENV 에만 남는다.

    .env 에 두지 않고 여기서 만든다 — 환경이 늘 때마다 세 파일에 같은 판단을 베껴 적지 않게.
    index.html 은 %VITE_ROBOTS% 로 받는다. Vite 는 .env 파일보다 process.env 를 먼저 보므로
    여기서 심으면 그대로 치환된다.
  */
  process.env.VITE_ROBOTS =
    process.env.VITE_APP_ENV === 'production'
      ? 'index, follow'
      : 'noindex, nofollow';

  return {
    plugins: [react()],
    // 빌드 시점에 상수로 치환된다. Sentry release 문자열을 여기서 굳힌다.
    define: {
      __APP_RELEASE__: JSON.stringify(`${pkg.version}-${gitSha}`),
      __APP_BUILT_AT__: JSON.stringify(builtAt),
    },
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },

      /**
       * React 를 **한 벌만** 번들한다.
       *
       * @hansapp/legal 이 `link:` 로 붙어 있고 타입용으로 자기 node_modules 에 react 를 갖는다.
       * 그대로 두면 패키지의 JSX 가 그쪽 react 를, 앱이 자기 react 를 잡아 두 벌이 실린다 —
       * 훅을 쓰지 않는 컴포넌트라 지금은 조용하지만, 번들이 커지고 나중에 훅이 들어가는 순간
       * "Invalid hook call" 로 터진다.
       */
      dedupe: ['react', 'react-dom'],
    },
    server: {
      // 127.0.0.1 로 고정한다(localhost 로 새지 않게). API 가 127.0.0.1:3000 이라, 쿠키(호스트 기준)가
      // 프론트↔API 사이에 흐르려면 프론트도 같은 호스트여야 한다. localhost 와 127.0.0.1 은 서로 다른 호스트다.
      host: '127.0.0.1',
      // 콘솔 전용 포트(인증웹 hansapp-auth 5273, medifinder 5173 과 겹치지 않게 5274).
      port: 5274,
      strictPort: true,
      // 단일 오리진 로컬: 이 콘솔(hans-app)이 front door. /auth/* 는 인증웹(hansapp-auth 5273),
      // /docs/* 는 문서(hansapp-docs 5272)로 프록시. 둘 다 경로를 그대로 넘기므로 대상 쪽
      // base 도 같은 접두(/auth/, /docs/)로 떠 있어야 자산 경로가 어긋나지 않는다.
      //   http://127.0.0.1:5274/           → 콘솔
      //   http://127.0.0.1:5274/auth/login → 인증웹 (base=/auth/)
      //   http://127.0.0.1:5274/docs       → 문서 (base=/docs/)
      proxy: {
        '/auth': { target: 'http://127.0.0.1:5273', changeOrigin: true },
        '/docs': { target: 'http://127.0.0.1:5272', changeOrigin: true },
      },
    },
    build: { outDir: 'dist' },
  };
});
