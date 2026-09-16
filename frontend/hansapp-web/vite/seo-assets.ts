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
 * 정적으로 관리하는 URL. **여기가 정적 자원의 정본이다.**
 *
 * sitemap.xml(인덱스)이 이 파일을 물고, 파일 안에 URL 이 들어간다.
 *
 * 빌드가 아는 것만 적는다 — 라우트 목록은 이 앱이 갖고 있으니, 다른 데로 옮겨 적으면
 * 정본이 둘이 된다(medifinder 의 STATIC_PATHS 가 그렇게 백엔드에 가 있다).
 *
 * **console.plzhans.com 자기 페이지만 싣는다.** 호스트가 다르면 남의 URL 을 못 싣는 것이
 * 규격이라, 루트(plzhans.com)의 사이트맵은 문서와 랜딩만 물고 이 콘솔은 안 문다.
 * 여기가 비면 콘솔 페이지를 광고할 곳이 없다.
 *
 * 약관은 뺀다(BAKED_ROUTES 에서 noindex 로 굽는다). /apps 는 로그인 게이트라 뺀다.
 * /board 는 아직 안 싣는다 — canonical 이 전부 홈을 가리켜서, 실어도 홈의 중복으로 합쳐진다.
 */
const STATIC_SITEMAP = { file: 'sitemap-pages.xml', routes: ['/'] };

/**
 * 자동 생성 사이트맵의 이름 접두사. **라우팅이 이 패턴으로 분기한다.**
 *
 *   console.plzhans.com/sitemap-auto-*  →  생성기 워커
 *   그 외                                →  이 사이트(정적 자산)
 *
 * 이름으로 주인을 가르는 이유: 라우트 규칙을 한 줄로 고정하기 위해서다. 생성물이 몇 개로
 * 늘어도 규칙은 그대로고, 파일 이름만 보고 어느 워커가 주는지 알 수 있다.
 *
 * 커스텀 도메인 위에 더 구체적인 Route 를 얹는 방식은 이 저장소가 이미 쓰고 있다
 * (랜딩 + /docs* → 문서 워커, docs/cloudflare.md 참고).
 */
const AUTO_SITEMAP_PREFIX = 'sitemap-auto-';

/**
 * 자동 생성 사이트맵의 파일 이름. **빌드는 만들지 않고 인덱스에 걸기만 한다.**
 *
 * 검색엔진에 알리는 입구는 sitemap.xml 하나다. 자식이 늘어도 robots.txt 는 안 바뀐다.
 * 자식이 하나 깨져도 인덱스가 통째로 버려지지는 않는다 — 멀쩡한 자식은 그대로 읽힌다.
 *
 * **여기 적는 순간 그 주소가 실제로 사이트맵을 돌려줘야 한다.** 없으면 SPA 폴백이
 * index.html 을 200 으로 주고, 검색엔진은 404 가 아니라 "사이트맵이 HTML" 오류로 받는다.
 *
 * 게시판(sitemap-auto-board.xml)을 넣기 전에 두 가지가 선행이다.
 *   1. board 라우트의 canonical.
 *   2. 만드는 쪽. 빌드가 API 를 읽어 굽거나, 배치가 만들어 따로 배포하거나
 *      (후자는 medifinder 선례가 있다 — .github/workflows/medifinder-sitemap.yml).
 */
const AUTO_SITEMAPS: string[] = [];

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
        자동 생성 사이트맵은 이름으로 라우팅된다. 접두사가 어긋나면 그 주소는 생성기 워커로
        가지 않고 이 사이트의 SPA 폴백에 걸려 index.html 을 돌려준다 — 빌드는 성공하고
        robots.txt 도 멀쩡해서, 검색엔진이 "사이트맵이 HTML" 이라고 할 때까지 아무도 모른다.
      */
      const misrouted = AUTO_SITEMAPS.filter(
        (file) => !file.startsWith(AUTO_SITEMAP_PREFIX),
      );
      if (misrouted.length > 0) {
        throw new Error(
          `[hansapp-web] 자동 생성 사이트맵 이름은 '${AUTO_SITEMAP_PREFIX}' 로 시작해야 라우팅이 집어간다: ${misrouted.join(', ')}`,
        );
      }

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
        robots.txt.

        **운영은 아무것도 막지 않는다.** robots.txt 는 크롤러를 문 앞에서 돌려보내는 것이라,
        막으면 안에 있는 noindex 를 못 읽는다 — 그러면 어딘가에 링크된 주소가 내용 없이
        URL 만 검색 결과에 남고 지울 수단도 사라진다. 색인에서 빼고 싶은 주소는 들여보낸 뒤
        HTML 의 noindex 로 거른다(BAKED_ROUTES).

        develop 은 통째로 막는다 — 도메인이 공개돼 있어 열어 두면 운영과 같은 내용이
        두 주소로 색인된다.
      */
      const robotsTxt = isProduction
        ? `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`
        : `User-agent: *\nDisallow: /\n`;
      writeFileSync(path.join(outDir, 'robots.txt'), robotsTxt, 'utf-8');

      /*
        사이트맵. **sitemap.xml 은 인덱스고, 거기서 갈라진다.**

          sitemap.xml
            ├ sitemap-pages.xml        정적. 이 빌드가 만든다.
            └ sitemap-auto-*.xml       자동. 생성기가 만들고 라우팅이 집어간다.

        가르는 기준은 URL 경로가 아니라 **누가 언제 만드느냐**다. 배포 때 정해지는 페이지와
        글이 생길 때 바뀌는 게시판을 한 파일에 두면, 한쪽 때문에 다른 쪽을 계속 다시 만들어야
        한다. 그래서 만드는 주체가 다르면 파일도 가르고, 이름에 그 경계를 드러낸다.

        자식은 **루트에 평평하게** 둔다(/boards/sitemap.xml 이 아니라). 규격상 사이트맵
        파일의 위치가 담을 수 있는 URL 범위를 제한해서, 하위 경로에 두면 그 경로로 시작하는
        URL 밖에 못 싣는다.

        검색엔진에 알리는 입구는 sitemap.xml 하나다(robots.txt). 자식이 늘어도 robots 는 그대로다.
        changefreq·priority 는 안 넣는다(검색엔진이 안 본다).
      */
      if (siteUrl) {
        const lastmod = lastModified();

        const urls = STATIC_SITEMAP.routes
          .map(
            (routePath) =>
              `  <url>\n    <loc>${siteUrl}${routePath}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`,
          )
          .join('\n');
        writeFileSync(
          path.join(outDir, STATIC_SITEMAP.file),
          `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
          'utf-8',
        );

        /*
          인덱스. 빌드가 만든 자식에만 lastmod 를 적는다 — 자동 생성분이 언제 바뀌었는지는
          우리가 모르고, 모르는 값을 지어내면 크롤러가 lastmod 자체를 안 믿게 된다.
        */
        const entries = [
          `  <sitemap>\n    <loc>${siteUrl}/${STATIC_SITEMAP.file}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </sitemap>`,
          ...AUTO_SITEMAPS.map(
            (file) => `  <sitemap>\n    <loc>${siteUrl}/${file}</loc>\n  </sitemap>`,
          ),
        ].join('\n');
        writeFileSync(
          path.join(outDir, 'sitemap.xml'),
          `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</sitemapindex>\n`,
          'utf-8',
        );
      } else {
        // 주소를 모르면 사이트맵을 만들 수 없다. 옛 산출물이 남아 오해를 사지 않게 지운다.
        for (const file of ['sitemap.xml', STATIC_SITEMAP.file]) {
          rmSync(path.join(outDir, file), { force: true });
        }
      }

      const sitemapNote = siteUrl
        ? ` + sitemap.xml(정적 ${STATIC_SITEMAP.routes.length}, 자동 ${AUTO_SITEMAPS.length})`
        : ' (sitemap 생략: VITE_SITE_URL 없음)';
      console.log(
        `[hansapp-web] seo: ${BAKED_ROUTES.length}쪽 굽기 + robots.txt${sitemapNote}`,
      );
    },
  };
}
