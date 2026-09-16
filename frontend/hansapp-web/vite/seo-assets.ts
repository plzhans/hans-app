import { execFileSync } from 'child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import path from 'path';
import type { Plugin } from 'vite';

/**
 * 검색엔진용 산출물(라우트별 HTML·robots.txt·sitemap.xml)을 빌드가 만든다.
 *
 * public/ 에 정적 파일로 두지 않는 이유: 그 파일들은 환경 치환을 안 거쳐서 develop 빌드가
 * 운영 주소를 그대로 내보낸다. 실제로 develop-console.plzhans.com/robots.txt 가
 * console.plzhans.com 사이트맵을 가리키고 있었다.
 *
 * 헤더(_headers)로 하지 않는 이유: Cloudflare·Netlify 계열에서만 통하는 포맷이라,
 * 다른 호스트로 옮기면 조용히 무시된다. 빌드도 성공하고 화면도 멀쩡한데 색인 정책만
 * 사라져서 한참 뒤에 안다. HTML 안에 박아 두면 어디에 올리든 따라간다.
 */

/**
 * 라우트별로 HTML 을 굽는다. 여기 있는 주소는 SPA 폴백을 타지 않고 자기 파일로 응답한다.
 *
 * **약관 라우트를 늘리면 여기에도 적어야 한다.** 안 적으면 그 주소는 홈의 index.html 로
 * 응답하므로 색인이 열리고, canonical 도 홈을 가리켜 홈의 중복으로 합쳐진다.
 */
const BAKED_ROUTES = [
  /*
    약관·방침. **크롤러를 들여보내되 색인만 막는다.**
    robots.txt 로 막으면 크롤러가 문 앞에서 돌아가 이 noindex 를 못 읽고, 스토어·심사 양식에
    적어 둔 주소가 내용 없이 URL 만 검색 결과에 남는다. follow 는 남긴다 — 이 문서를 색인하지
    말라는 것이지 여기 걸린 링크까지 끊을 이유는 없다.
  */
  { routePath: '/terms/service', robots: 'noindex, follow' },
  { routePath: '/terms/app', robots: 'noindex, follow' },
  { routePath: '/terms/privacy', robots: 'noindex, follow' },
];

/**
 * 사이트맵에 싣는 주소. **console.plzhans.com 자기 페이지만 싣는다.**
 *
 * 호스트가 다르면 남의 URL 을 못 싣는 것이 규격이라, 루트(plzhans.com)의 사이트맵은 문서와
 * 랜딩만 물고 이 콘솔은 안 문다. 여기가 비면 콘솔 페이지를 광고할 곳이 없다.
 *
 * 약관은 뺀다(위에서 noindex 로 굽는다). /apps 는 로그인 게이트라 뺀다.
 * /board 는 아직 안 싣는다 — 라우트마다 canonical 이 홈을 가리키고 있어, 지금 실어도
 * 홈의 중복으로 합쳐진다. canonical 을 라우트별로 세운 뒤에 넣을 것.
 */
const SITEMAP_ROUTES = ['/'];

/** index.html 의 태그 값 하나를 바꾼다. 못 찾으면 던진다 — 조용히 넘어가면 배포하고 나서야 안다. */
function replaceAttribute(
  html: string,
  pattern: RegExp,
  value: string,
  label: string,
): string {
  if (!pattern.test(html)) {
    throw new Error(
      `[hansapp-web] index.html 에서 ${label} 태그를 못 찾았다. 태그를 고쳤으면 vite/seo-assets.ts 도 같이 고칠 것.`,
    );
  }
  return html.replace(pattern, (_match, prefix: string) => `${prefix}${value}"`);
}

const ROBOTS_TAG = /(<meta name="robots" content=")[^"]*"/;
const CANONICAL_TAG = /(<link rel="canonical" href=")[^"]*"/;
const OG_URL_TAG = /(<meta property="og:url" content=")[^"]*"/;

/**
 * 사이트맵의 lastmod. **빌드 시각이 아니라 마지막 커밋 시각이다.**
 * 빌드 시각을 쓰면 같은 커밋을 다시 배포하는 것만으로 값이 달라져, 바뀐 것이 없는데
 * 바뀌었다고 알리게 된다(wrangler.jsonc 가 compatibility_date 를 고정하는 것과 같은 이유).
 * git 을 못 읽는 환경이면 빌드 날짜로 떨어진다.
 */
function lastModified(): string {
  try {
    return execFileSync('git', ['log', '-1', '--format=%cI'], {
      encoding: 'utf-8',
    })
      .trim()
      .slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function seoAssets(): Plugin {
  /*
    산출물 경로는 vite 가 알려 주는 값을 쓴다. 설정이 ESM 이라 __dirname 은 번들된 설정의
    위치를 따라가서, 이 파일 기준으로 계산하면 엉뚱한 곳을 가리킬 수 있다.
  */
  let outDir = '';
  /*
    사이트 주소는 **vite 가 해석한 env 에서 읽는다**(process.env 가 아니라).
    index.html 의 %VITE_SITE_URL% 을 치환한 것이 이 값이라, 여기서 같은 값을 써야 구운
    페이지의 canonical 이 홈의 canonical 과 같은 호스트를 가리킨다.
  */
  let siteUrl = '';

  return {
    name: 'hansapp-seo-assets',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
      // .env 는 끝의 / 를 안 붙이기로 돼 있지만, 붙어 들어와도 주소가 깨지지 않게 한 번 턴다.
      siteUrl = (config.env.VITE_SITE_URL ?? '').replace(/\/+$/, '');
    },
    closeBundle() {
      /*
        운영 여부는 vite.config.ts 가 VITE_ROBOTS 를 정할 때 쓴 것과 **같은 기준**이어야 한다.
        기준이 갈리면 구운 페이지의 robots 와 홈의 robots 가 서로 다른 말을 한다.
      */
      const isProduction = process.env.VITE_APP_ENV === 'production';

      const baseHtml = readFileSync(path.join(outDir, 'index.html'), 'utf-8');

      for (const route of BAKED_ROUTES) {
        /*
          develop 은 사이트 전체가 noindex, nofollow 다(vite.config.ts 의 VITE_ROBOTS).
          거기에 follow 를 얹으면 develop 이 색인 대상처럼 보이므로, 운영에서만 값을 바꾼다.
        */
        let html = isProduction
          ? replaceAttribute(baseHtml, ROBOTS_TAG, route.robots, 'robots')
          : baseHtml;

        /*
          canonical·og:url 은 index.html 이 홈으로 박아 둔다. 그대로 복사하면 이 페이지가
          "내 정본은 홈" 이라고 말하는 셈이라 자기 주소로 고쳐 준다.
          주소를 모르는 빌드(로컬 `vite build`)에서는 건드리지 않는다 — 치환할 값이 없다.
        */
        if (siteUrl) {
          const absolute = `${siteUrl}${route.routePath}`;
          html = replaceAttribute(html, CANONICAL_TAG, absolute, 'canonical');
          html = replaceAttribute(html, OG_URL_TAG, absolute, 'og:url');
        }

        const dir = path.join(outDir, route.routePath.replace(/^\//, ''));
        mkdirSync(dir, { recursive: true });
        writeFileSync(path.join(dir, 'index.html'), html, 'utf-8');
      }

      /*
        robots.txt. develop 은 통째로 막는다 — 도메인이 공개돼 있어 열어 두면 운영과 같은
        내용이 두 주소로 색인된다. 운영은 로그인 게이트인 /apps 만 막는다.
        /terms 는 **막지 않는다** — 위에서 구운 noindex 를 크롤러가 읽어야 지워진다.
      */
      const robotsTxt = isProduction
        ? `User-agent: *\nAllow: /\nDisallow: /apps\n\nSitemap: ${siteUrl}/sitemap.xml\n`
        : `User-agent: *\nDisallow: /\n`;
      writeFileSync(path.join(outDir, 'robots.txt'), robotsTxt, 'utf-8');

      /*
        sitemap.xml. 인덱스로 감싸지 않는다 — 인덱스는 /docs 를 갈라내려고 세운 것이었고,
        문서가 루트 도메인으로 나간 지금은 자식이 하나뿐이라 한 겹이 그냥 낭비다.
        changefreq·priority 는 안 넣는다(검색엔진이 안 본다).
      */
      if (siteUrl) {
        const lastmod = lastModified();
        const urls = SITEMAP_ROUTES.map(
          (routePath) =>
            `  <url>\n    <loc>${siteUrl}${routePath}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`,
        ).join('\n');
        writeFileSync(
          path.join(outDir, 'sitemap.xml'),
          `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
          'utf-8',
        );
      } else {
        // 주소를 모르면 사이트맵을 만들 수 없다. 옛 산출물이 남아 오해를 사지 않게 지운다.
        rmSync(path.join(outDir, 'sitemap.xml'), { force: true });
      }

      console.log(
        `[hansapp-web] seo: ${BAKED_ROUTES.length}쪽 굽기 + robots.txt${siteUrl ? ' + sitemap.xml' : ' (sitemap 생략: VITE_SITE_URL 없음)'}`,
      );
    },
  };
}
