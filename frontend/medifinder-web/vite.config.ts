import { defineConfig, type Plugin } from 'vite';
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

  UTC(ISO)로 굽고 펴는 것은 화면이 한다(푸터의 숨은 버전 표시).
  개발 서버로 띄우면 이 값은 **dev server 를 켠 시각**이다 — 파일을 고쳐도 갱신되지 않는다.
*/
const builtAt = new Date().toISOString();

/**
 * index.html 의 주석을 **빌드 산출물에서만** 걷어낸다.
 *
 * HTML 주석은 브라우저로 그대로 나가서 누구나 소스 보기로 읽는다. 그런데 이 파일의 주석은
 * 대외 설명이 아니라 **우리끼리 보는 개발 메모**다(왜 viewport-fit 이 필요한지, 어느 봇이
 * 이 값을 읽는지 등). 내부 판단 근거와 서비스 구조가 그대로 노출된다.
 *
 * 그렇다고 지우면 다시 깨질 지식을 잃는다 — viewport-fit 을 빼면 세이프에어리어 값이 전부
 * 0 이 되는 것 같은 건, 모르면 반드시 다시 밟는다. 그래서 **소스에는 남기고 산출물에서만**
 * 없앤다. 사람이 매번 기억하는 대신 빌드가 강제한다.
 *
 * apply: 'build' 라 개발 서버에서는 그대로 보인다.
 */
function stripHtmlComments(): Plugin {
  return {
    name: 'strip-html-comments',
    apply: 'build',
    transformIndexHtml(html) {
      // <!doctype> 는 주석이 아니라 안 걸린다. 남는 빈 줄까지 정리한다.
      return html.replace(/\s*<!--[\s\S]*?-->/g, '');
    },
  };
}

export default defineConfig(({ mode, isSsrBuild }) => {
  console.log(`[vite] mode=${mode}  VITE_HANSAPP_BASE_URL=${process.env.VITE_HANSAPP_BASE_URL ?? '(not set)'}`);
  return {
    plugins: [react(), stripHtmlComments()],
    // 빌드 시점에 상수로 치환된다. Sentry release 문자열을 여기서 굳힌다.
    define: {
      __APP_RELEASE__: JSON.stringify(`${pkg.version}-${gitSha}`),
      __APP_BUILT_AT__: JSON.stringify(builtAt),
      // Sentry 가 문서로 안내하는 트리셰이킹 플래그. 디버그 로깅 코드를 걷어낸다(gzip 3KB).
      // __SENTRY_TRACING__ 은 건드리지 않는다 — 트레이싱을 쓰고 있어서 끄면 깨진다.
      __SENTRY_DEBUG__: false,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },

      /**
       * Capacitor core 를 **한 벌만** 번들한다.
       *
       * auth-sdk 가 `link:` 로 붙어 있고 자기 node_modules 에 @capacitor/core 를 따로 갖는다.
       * 그대로 두면 auth-sdk(Preferences)와 앱(Geolocation·NativeSettings)이 **서로 다른
       * core 인스턴스**를 잡는다. 플러그인 레지스트리가 core 모듈의 전역 상태라, 갈라지면
       * 한쪽이 네이티브 구현을 못 찾고 조용히 웹 폴백으로 떨어진다 — 앱에서만 재현되는
       * 종류의 버그다.
       *
       * 지금은 auth 코드가 아직 어디서도 안 불려 번들에 없지만, 붙는 순간 문제가 된다.
       */
      dedupe: ['@capacitor/core'],
    },
    server: {
      /*
        **127.0.0.1 로 고정한다.** host:true(0.0.0.0)로 두면 vite 가 Local 주소를
        `http://localhost:5173` 으로 찍는데, 그 주소로 열면 API·인증웹(127.0.0.1)과 **다른
        호스트**가 되어 쿠키가 흐르지 않고 클라이언트 등록 오리진과도 어긋난다.
        브라우저 주소창에 무엇이 뜨느냐가 곧 오리진이라, 찍히는 주소부터 맞춰 둔다.

        LAN 의 다른 기기(휴대폰)에서 열어 봐야 할 때는 이 줄을 잠시 `true` 로 돌린다 —
        그때는 네이버 지도 키와 클라이언트 등록 오리진이 그 주소를 모른다는 점을 감안할 것.
      */
      host: '127.0.0.1',

      /**
       * 포트를 못 박는다. 네이버 지도 키는 http://127.0.0.1:5173 **한 포트에만** 묶여 있어서,
       * vite 가 포트를 하나 밀어 5174 로 뜨면 지도가 인증 실패로 조용히 안 나온다.
       * 이미 5173 이 물려 있으면 다른 포트로 도망가지 말고 그냥 실패해라.
       */
      port: 5173,
      strictPort: true,
    },
    /**
     * `vite build --ssr src/entry-server.tsx` 로 워커가 쓸 번들을 만들 때만 본다.
     * 클라이언트 빌드에는 영향이 없다.
     */
    ssr: {
      // 워커에는 node_modules 가 없다. 의존성을 전부 번들 안에 넣어야 한다.
      // (기본값은 외부로 남기는 것이라 그대로 두면 런타임에 react 를 못 찾는다.)
      noExternal: true,
      // 노드가 아니라 웹 표준 런타임이다. react-dom/server 가 스트림 대신
      // ReadableStream 을 쓰는 판본으로 잡히는 것도 이 조건 덕이다.
      target: 'webworker',
    },
    build: {
      outDir: 'dist',
      // 워커 번들에는 public/ 이 필요 없다. 클라이언트 빌드가 이미 dist/ 로 옮겼고,
      // 자산을 내보내는 것은 그쪽이다.
      copyPublicDir: !isSsrBuild,
      /*
        **manualChunks 로 벤더를 가르지 않는다.**

        갈라서 배포하고 n=9 로 양쪽을 재 봤더니 Lighthouse 모바일 LCP 중앙값이 5.3s 로 같았다.
        측정이 4.1~4.3 과 5.3 두 무리로 갈리는 이봉분포라 표본이 적으면 중앙값이 크게 흔들린다
        (처음엔 n=3 기준선과 비교해 회귀라고 잘못 읽었다).

        즉 **효과가 없다.** 얻는다는 재방문 캐시도 추정일 뿐이라, 설정을 늘리지 않는 쪽을 택한다.
        번들 크기로 이 LCP 를 움직이려는 시도는 여기서 한계다 — 남은 건 프리렌더/SSR 이다.
      */
    },
  };
});
