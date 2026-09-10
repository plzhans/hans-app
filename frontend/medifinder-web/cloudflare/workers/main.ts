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
import { splitLang } from './routing';
import { metaFor } from './meta';
import { headTags } from './head';
import { renderHospital } from '../../dist-server/entry-server.js';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // 정적 자산은 손대지 않는다. 껍데기(HTML)만 고친다.
    const asset = await env.ASSETS.fetch(request);
    if (!asset.headers.get('content-type')?.includes('text/html')) return asset;

    // 변수가 없으면 아무것도 하지 않는다. ci-deploy.sh 가 --var 를 넘기기 전에 배포되면
    // 여기가 undefined 인데, 그대로 두면 canonical 이 `undefined/hospitals/1` 로 나간다 —
    // 없는 것보다 나쁘다.
    if (!env.VITE_SITE_URL || !env.VITE_HANSAPP_BASE_URL || !env.VITE_HANSAPP_CLIENT_ID) {
      return asset;
    }

    const url = new URL(request.url);
    const { lang, path } = splitLang(url.pathname);
    const meta = await metaFor(lang, path, env, ctx);
    if (!meta) return asset;

    // 본문. 실패해도 <head> 는 채운 채로 내보낸다 — 브라우저는 어차피 스스로 그리므로
    // 사람에게는 아무 차이가 없고, 크롤러도 제목·구조화 데이터는 그대로 읽는다.
    let body: { html: string; state: string } | null = null;
    if (meta.render) {
      try {
        body = await renderHospital({
          url: url.toString(),
          lang,
          id: meta.render.id,
          hospital: meta.render.hospital,
          nearby: meta.render.nearby,
        });
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

    return rewriter.transform(asset);
  },
} satisfies ExportedHandler<Env>;

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
