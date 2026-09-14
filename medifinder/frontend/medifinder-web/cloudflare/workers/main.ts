/**
 * 정적 자산을 그대로 뱉는 대신, HTML 응답을 채워서 내보낸다.
 *
 * 이 앱은 CSR 이라 원본 HTML 이 1.6KB 껍데기다. 제목·설명·OG·canonical 과 본문을 전부
 * 브라우저가 JS 로 만드는데, 그건 JS 를 실행하는 크롤러만 본다. 카카오톡·라인의 미리보기
 * 봇도, 네이버 Yeti 도 실행하지 않는다. 여기서 채우면 응답 HTML 자체에 들어간다.
 *
 * 채우는 정도가 경로마다 다르다.
 *   병원 상세   <head> + 본문까지 전부(entry-server.tsx 가 그린다)
 *   그 외       <head> 만
 *
 * 상세만 본문을 그리는 것은 거기만 크롤러가 읽을 내용이 있어서다. 홈·검색은 결과가
 * 사용자 입력에 달렸고, 약관은 색인 대상이 아니다.
 *
 * 레포 루트의 cloudflare/ 와 다른 것이다. 그쪽은 zone·DNS·규칙을 다루는 인프라 관리
 * 스크립트고, 여기는 이 앱과 함께 배포되는 런타임 코드다.
 */
import type { Env } from './env';
import { canonicalPath, splitLang } from './routing';
import { metaFor } from './meta';
import { headTags } from './head';
import { renderHome, renderHospital } from '../../dist-server/entry-server.js';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // 주소를 하나로 모은다. 끝 슬래시·기본 언어 접두사가 붙은 주소는 여기서 301 로
    // 되돌린다 — 그냥 두면 같은 문서가 두 주소로 색인된다.
    const canonical = canonicalPath(url.pathname);
    if (canonical !== url.pathname) {
      return Response.redirect(`${url.origin}${canonical}${url.search}`, 301);
    }

    // 껍데기를 직접 집는다. 요청 경로로 집으면 안 된다 — not_found_handling 이
    // 404-page 라서, /search 처럼 실제 파일이 없는 경로는 404 문서가 돌아온다.
    const asset = await env.ASSETS.fetch(new URL('/index.html', url));
    if (!asset.headers.get('content-type')?.includes('text/html')) return asset;

    // 프로덕션이 아니면 여기서부터 나가는 HTML 은 전부 색인 대상에서 뺀다.
    // develop 은 프로덕션과 내용이 같아서, 색인되면 서로 중복 문서로 경쟁한다.
    const noindexEnv = env.APP_ENV !== 'production';

    // 변수가 없으면 아무것도 하지 않는다. ci-deploy.sh 가 --var 를 넘기기 전에 배포되면
    // 여기가 undefined 인데, 그대로 두면 canonical 이 `undefined/hospitals/1` 로 나간다 —
    // 없는 것보다 나쁘다.
    if (!env.VITE_SITE_URL || !env.VITE_HANSAPP_BASE_URL || !env.VITE_HANSAPP_CLIENT_ID) {
      return mark(asset, noindexEnv);
    }

    const { lang, path } = splitLang(url.pathname);
    const meta = await metaFor(lang, path, env, ctx);
    if (!meta) return mark(asset, noindexEnv);

    // 없는 문서. 껍데기는 그대로 내보낸다 — 브라우저가 404 화면을 그린다.
    // 상태 코드만 바꾸면 크롤러는 색인하지 않고 사람은 평소와 같은 화면을 본다.
    if (meta.notFound) {
      return mark(notFound(asset, meta.title, meta.description), noindexEnv);
    }

    // 본문. 실패해도 <head> 는 채운 채로 내보낸다 — 브라우저는 어차피 스스로 그리므로
    // 사람에게는 아무 차이가 없고, 크롤러도 제목·구조화 데이터는 그대로 읽는다.
    let body: { html: string; state: string } | null = null;
    if (meta.render) {
      const render = meta.render;
      try {
        body =
          render.kind === 'hospital'
            ? await renderHospital({
                url: url.toString(),
                lang,
                id: render.id,
                hospital: render.hospital,
                nearby: render.nearby,
              })
            : await renderHome({ url: url.toString(), lang, sections: render.sections });
      } catch {
        body = null;
      }
    }

    // 핸들러는 void 를 돌려줘야 한다. HTMLRewriter 의 메서드는 체이닝하라고 Element 를
    // 반환하므로, 화살표 축약형으로 쓰면 그게 그대로 반환값이 되어 타입이 안 맞는다.
    let rewriter = new HTMLRewriter()
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
          if (body) e.append(stateScript(body.state), { html: true });
        },
      });

    if (body) {
      const html = body.html;
      rewriter = rewriter.on('#root', {
        element(e) {
          e.setInnerContent(html, { html: true });
        },
      });
    }

    return mark(rewriter.transform(asset), noindexEnv);
  },
} satisfies ExportedHandler<Env>;

/**
 * 없는 문서를 404 로 내보낸다. 본문은 껍데기 그대로이고 제목과 설명만 바꾼다.
 *
 * 예전에는 이 경우에도 200 이 나갔다. SPA 폴백이 모든 미매칭 경로에 index.html 을
 * 200 으로 돌려줬기 때문이다. 사이트맵에 9만 개 URL 이 올라가 있고 병원 ID 는
 * 폐업으로 사라지므로, 그대로 두면 soft 404 가 계속 쌓인다.
 */
function notFound(asset: Response, title: string, description: string): Response {
  const html = new HTMLRewriter()
    .on('title', {
      element(e) {
        e.setInnerContent(title);
      },
    })
    .on('meta[name="description"]', {
      element(e) {
        e.setAttribute('content', description);
      },
    })
    .transform(asset);

  return new Response(html.body, { status: 404, headers: html.headers });
}

/**
 * 프로덕션이 아닌 환경의 응답에 X-Robots-Tag 를 단다.
 *
 * robots.txt 의 Disallow 로 막지 않는 이유는, 그러면 크롤 자체가 안 일어나 noindex 를
 * 읽지도 못하기 때문이다. 이미 색인된 URL 은 그대로 남는다. 크롤은 열어 두고 색인만 막는다.
 */
function mark(res: Response, noindex: boolean): Response {
  if (!noindex) return res;
  const marked = new Response(res.body, res);
  marked.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return marked;
}

/**
 * 서버가 이미 받아 둔 데이터를 브라우저에 넘긴다. entry-client.tsx 가 이걸 읽어 캐시를
 * 채우므로, 화면이 뜨자마자 같은 병원을 다시 부르지 않는다.
 *
 * <head> 에 둔다. 앱 스크립트보다 먼저 실행돼야 하고, 본문에 넣으면 서버가 그린 트리와
 * 브라우저의 첫 렌더가 어긋난다.
 *
 * `<` 를 이스케이프하는 것은 데이터 안의 `</script>` 가 태그를 닫아 버리는 것을 막기
 * 위해서다. 병원 소개글은 우리가 쓴 문장이 아니다.
 */
function stateScript(state: string) {
  return `<script>window.__RQ_STATE__=${state.replace(/</g, '\\u003c')}</script>`;
}
