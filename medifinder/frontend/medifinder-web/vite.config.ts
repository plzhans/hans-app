import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync } from 'fs';
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

/**
 * robots.txt 의 Sitemap 줄을 이 환경의 주소로 채운다.
 *
 * **상대경로를 쓸 수 없다.** sitemaps.org 규격과 구글 모두 Sitemap 지시자에 절대 URL 을
 * 요구한다. 그래서 소스에는 자리표시자를 두고 빌드가 채운다 — public/ 파일은 Vite 가
 * 그대로 복사할 뿐 치환하지 않으므로, 여기서 산출물만 덮어쓴다.
 *
 * 박아 두면 develop 이 운영 사이트맵을 가리킨다. 피해가 크지는 않지만(develop 은
 * X-Robots-Tag 로 색인을 막는다) "크롤은 열어 두고 색인만 막는다"(main.ts)는 방침과
 * 어긋난다 — 크롤을 열어 놓고 정작 자기 사이트맵은 안 알려주는 셈이 된다.
 *
 * 워커가 동적으로 만들지 않는 이유는 그러면 정적 자산 요청이 워커를 타기 때문이다
 * (wrangler.jsonc 의 run_worker_first 주석 참고).
 */
function siteUrlInRobots(): Plugin {
  return {
    name: 'site-url-in-robots',
    apply: 'build',
    // 클라이언트 번들에만 건다. SSR 번들(dist-server)에는 robots.txt 가 없다.
    closeBundle() {
      if (this.environment?.config.build.ssr) return;

      const siteUrl = process.env.VITE_SITE_URL;
      if (!siteUrl) {
        this.error('VITE_SITE_URL 이 없다. robots.txt 의 Sitemap 주소를 채울 수 없다.');
      }

      const target = path.resolve(__dirname, 'dist/robots.txt');
      const filled = readFileSync(target, 'utf8').replaceAll('__SITE_URL__', siteUrl);
      if (filled.includes('__SITE_URL__')) {
        this.error('robots.txt 치환이 끝나지 않았다.');
      }
      writeFileSync(target, filled);
      console.log(`[vite] robots.txt Sitemap → ${siteUrl}/sitemap.xml`);
    },
  };
}

/**
 * dist/404.html 을 index.html 사본으로 만든다.
 *
 * wrangler.jsonc 의 not_found_handling 이 404-page 라 Cloudflare 가 없는 경로에
 * 이 파일을 404 상태로 내보낸다. 내용이 index.html 과 같으므로 SPA 가 그대로 떠서
 * NotFound 화면을 그린다 — 사람은 평소와 같은 화면을 보고 크롤러는 404 를 받는다.
 *
 * 손으로 관리하지 않는 이유는 index.html 이 참조하는 번들 파일명에 해시가 붙어서다.
 * public/ 에 따로 두면 배포할 때마다 낡은 해시를 가리킨다.
 */
function notFoundPage(): Plugin {
  return {
    name: 'not-found-page',
    apply: 'build',
    closeBundle() {
      if (this.environment?.config.build.ssr) return;

      const dist = path.resolve(__dirname, 'dist');
      writeFileSync(path.join(dist, '404.html'), readFileSync(path.join(dist, 'index.html')));
      console.log('[vite] dist/404.html ← index.html');
    },
  };
}

export default defineConfig(({ mode, isSsrBuild }) => {
  console.log(`[vite] mode=${mode}  VITE_HANSAPP_BASE_URL=${process.env.VITE_HANSAPP_BASE_URL ?? '(not set)'}`);
  return {
    /*
      **렌더 차단 CSS 를 <head> 에 인라인하지 않는다.**

      Lighthouse 가 스타일시트 둘(앱 7.4KB · 폰트 8.3KB, 둘 다 brotli)을 렌더 차단으로
      잡고 "1,340ms 절약 가능" 이라고 해서 넣어 봤다. 인라인하면 그 항목은 실제로
      사라진다 — 32회 측정 전부 "없음" 이었다.

      **그런데 LCP 가 움직이지 않는다.** develop 에 A/B 를 번갈아 올리고 PSI 캐시를
      쿼리로 깨서 각 16회를 재 봤다(모바일, /hospitals/22303).

        LCP 중앙값   인라인 4.13s   별도 파일 4.05s   p=0.82
        FCP 중앙값   인라인 3.38s   별도 파일 3.83s   p=0.64

      즉 Lighthouse 의 "Est savings" 는 추정이지 실측이 아니다.
      n=8 까지는 2초 차이로 보였는데 16으로 늘리니 사라졌다 — manualChunks 때와 같은
      이봉분포 함정이다(1.7초대와 4.2초대 두 무리로 갈린다).

      얻는 것이 없는 대신 재방문자가 매번 15.8KB 를 더 받고, 폰트 CSS 의 상대 url() 92개를
      절대경로로 바꿔 주지 않으면 하위 경로에서 폰트가 통째로 404 나는 함정이 생긴다.

      남은 병목은 JS 쪽으로 보인다(미사용 192KB, 그중 GTM 171KB).
    */
    plugins: [react(), stripHtmlComments(), siteUrlInRobots(), notFoundPage()],
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
      /**
       * react-query·React 도 **한 벌만** 번들한다.
       *
       * @hansapp/api-sdk 가 같은 사정이다 — `link:` 로 붙고 자기 node_modules 에 react-query 를
       * 따로 갖는다(혼자서도 타입 검사가 되어야 해서 devDependency 로 들고 있다).
       * 갈라지면 SDK 의 훅이 만든 쿼리가 앱의 QueryClient 와 다른 컨텍스트에 붙어서,
       * 캐시가 통째로 비어 보이고 SSR 로 심어 둔 데이터도 안 잡힌다.
       */
      dedupe: ['@capacitor/core', '@tanstack/react-query', 'react', 'react-dom'],
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
