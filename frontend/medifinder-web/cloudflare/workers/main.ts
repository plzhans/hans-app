/**
 * **스파이크입니다. 아직 배포에 연결되어 있지 않습니다.** 켜는 법은 파일 끝 참고.
 *
 * ---
 *
 * 정적 자산을 그대로 뱉는 대신, HTML 응답의 <head> 를 채워서 내보낸다.
 *
 * **왜.** 이 앱은 CSR 이라 원본 HTML 이 1.6KB 껍데기다. 제목·설명·OG·canonical 을 화면에서
 * JS 로 세우는데, 그건 JS 를 실행하는 크롤러만 본다. 카카오톡·라인·X 의 미리보기 봇은
 * 실행하지 않아 공유 링크에 제목이 아예 안 붙는다. 여기서 채우면 **응답 HTML 자체에**
 * 들어가므로 누가 읽든 보인다.
 *
 * **이게 SSR 은 아니다.** <body> 는 여전히 빈 <div id="root"> 다. head 만 고친다.
 * 네이버가 병원 정보 '본문'을 읽게 하려면 그건 별도 작업이다.
 *
 * **레포 루트의 cloudflare/ 와 다른 것이다.** 그쪽은 zone·DNS·규칙을 다루는 인프라 관리
 * 스크립트고, 여기는 이 앱과 함께 배포되는 런타임 코드다.
 */
import type { Env } from './env';
import { splitLang } from './routing';
import { metaFor } from './meta';
import { headTags } from './head';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // 정적 자산은 손대지 않는다. 껍데기(HTML)만 고친다.
    const asset = await env.ASSETS.fetch(request);
    if (!asset.headers.get('content-type')?.includes('text/html')) return asset;

    // **변수가 없으면 아무것도 하지 않는다.** ci-deploy.sh 가 --var 를 넘기기 전에
    // 배포되면 여기가 undefined 인데, 그대로 두면 canonical 이
    // `undefined/hospitals/1` 로 나간다 — 없는 것보다 나쁘다.
    if (!env.VITE_SITE_URL || !env.VITE_HANSAPP_BASE_URL || !env.VITE_HANSAPP_CLIENT_ID) {
      return asset;
    }

    const { lang, path } = splitLang(new URL(request.url).pathname);
    const meta = await metaFor(lang, path, env, ctx);
    if (!meta) return asset;

    // 핸들러는 void 를 돌려줘야 한다. HTMLRewriter 의 메서드는 체이닝하라고 Element 를
    // 반환하므로, 화살표 축약형으로 쓰면 그게 그대로 반환값이 되어 타입이 안 맞는다.
    return new HTMLRewriter()
      .on('title', {
        element(e) {
          e.setInnerContent(meta.title);
        },
      })
      .on('meta[name="description"]', {
        element(e) {
          e.setAttribute('content', meta.description);
        },
      })
      .on('html', {
        element(e) {
          e.setAttribute('lang', lang);
        },
      })
      .on('head', {
        element(e) {
          e.append(headTags({ meta, lang, path, siteUrl: env.VITE_SITE_URL }), { html: true });
        },
      })
      .transform(asset);
  },
} satisfies ExportedHandler<Env>;

/*
  ------------------------------------------------------------------ 켜는 법

  1) wrangler.jsonc — 앱 루트에 그대로 둔다. wrangler 가 **실행 디렉터리 기준으로** 설정을
     찾으므로 여기로 옮기면 ci-deploy.sh 에 --config 를 붙여야 한다.

     {
       "main": "./cloudflare/workers/main.ts",
       "assets": {
         "directory": "./dist/",
         "binding": "ASSETS",
         "not_found_handling": "single-page-application",
         // **HTML 경로만 태운다.** 정적 자산 요청은 무료·무제한인데 워커를 거치는 순간
         // 과금 대상이 되고, 무료 플랜에서는 일 10만 요청 상한에 함께 잡힌다.
         // true 로 두면 /assets/* 까지 전부 거기 들어간다.
         "run_worker_first": ["/", "/search", "/hospitals/*", "/terms/*",
                              "/en-us/*", "/ja/*", "/zh-hans/*"]
       }
     }

  2) tsconfig.worker.json 을 만들어 tsconfig.json 의 references 에 넣고
     @cloudflare/workers-types 를 설치한다. Fetcher·HTMLRewriter·ExecutionContext 가
     거기서 온다(지금 타입 오류가 나는 건 이것뿐이다).

  3) ci-deploy.sh 가 빌드할 때 읽는 .env.<환경> 을 그대로 --var 로 넘긴다.
     CLI 가 설정 파일을 이기므로 진실이 한 곳에 유지된다.

       --var VITE_SITE_URL:"$VITE_SITE_URL"
       --var VITE_HANSAPP_BASE_URL:"$VITE_HANSAPP_BASE_URL"
       --var VITE_HANSAPP_CLIENT_ID:"$VITE_HANSAPP_CLIENT_ID"

  ------------------------------------------------------------------ 남은 것

  - 실패해도 화면이 멀쩡해서 조용히 죽는다. 응답에 관측용 헤더를 붙일지 정해야 한다.
  - og:image 가 /og.png 를 가리키는데 그 파일이 아직 없다.
  - run_worker_first 가 배열일 때 SPA 폴백과의 우선순위는 문서에 명시가 없다.
    develop 에 한 번 올려 확인해야 한다.
*/
