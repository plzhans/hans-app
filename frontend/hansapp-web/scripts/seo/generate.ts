import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import path from 'path';

/**
 * 빌드 산출물의 검색엔진용 마무리. **`vite build` 가 끝난 뒤에 돈다**(frontend/ci-build.sh).
 *
 * 하는 일이 둘이다.
 *   1. public/ 의 정적 파일에 남은 자리표시자를 채우고, 운영이면 robots 를 바꿔 끼운다
 *   2. 약관 라우트를 자기 HTML 로 굽는다
 *
 * robots.txt·sitemap 을 여기서 조립하지 않는다 — 내용이 정적이고 호스트만 환경마다 다르다.
 * 파일은 public/ 에 그대로 두고 자리표시자만 채운다(medifinder 의 site-url-in-robots 와 같은 방식).
 * 그래야 robots 를 고치려고 TypeScript 를 열지 않는다.
 *
 * 헤더(_headers)로 하지 않는 이유: Cloudflare·Netlify 계열에서만 통하는 포맷이라 다른
 * 호스트로 옮기면 조용히 무시된다. HTML 안에 박아 두면 어디에 올리든 따라간다.
 */

/** 정적 파일에 박아 둔 호스트 자리표시자. */
const PLACEHOLDER = '__SITE_URL__';

/**
 * 운영에서만 dist/robots.txt 를 덮는 파일. 어느 환경이든 산출물에서는 지운다.
 *
 * **두 robots 파일에 설명 주석을 달지 않는다.** 그대로 서빙되는 대외 문서라 내부 동작을
 * 적을 자리가 아니고, 자리표시자를 주석에 쓰면 그것까지 치환돼 문장이 깨진다.
 */
const PRODUCTION_ROBOTS = 'robots.production.txt';

/** 자리표시자를 채울 파일들. 여기 없는 파일에 자리표시자가 남아 있으면 그대로 배포된다. */
const FILLED_FILES = ['robots.txt', 'sitemap.xml', 'sitemap-pages.xml'];

/**
 * 라우트별로 HTML 을 굽는다. 여기 있는 주소는 SPA 폴백을 타지 않고 자기 파일로 응답한다.
 *
 * 약관·방침의 **주 장치는 robots.txt 의 `Disallow: /terms` 다.** 검색해서 들어올 문서가
 * 아니라 크롤 자체를 받지 않는다.
 *
 * 여기 굽는 noindex 는 **그걸 지키지 않는 크롤러용 보조 장치다.** 규칙을 지키는 크롤러는
 * 문 앞에서 돌아가므로 이 태그를 읽지 않는다 — 두 장치가 겹쳐 보이지만 보는 대상이 다르다.
 * canonical·og:url 은 robots.txt 와 무관하게 쓰인다(링크 미리보기가 그대로 가져간다).
 *
 * 그 대가로 **외부에 링크된 주소는 내용 없이 URL 만 검색 결과에 남을 수 있다.** 크롤을
 * 막았으니 지울 수단도 없다. 약관은 그래도 되는 문서라 받아들인 선택이다.
 *
 * **약관 라우트를 늘리면 여기에도 적어야 한다.** 안 적으면 그 주소는 홈의 index.html 로
 * 응답하므로 색인이 열린다.
 */
const BAKED_ROUTES = [
  { routePath: '/terms/service', robots: 'noindex, follow' },
  { routePath: '/terms/app', robots: 'noindex, follow' },
  { routePath: '/terms/privacy', robots: 'noindex, follow' },
];

const ROBOTS_TAG = /(<meta name="robots" content=")[^"]*"/;
const CANONICAL_TAG = /(<link rel="canonical" href=")[^"]*"/;
const OG_URL_TAG = /(<meta property="og:url" content=")[^"]*"/;

/** index.html 의 태그 값 하나를 바꾼다. 못 찾으면 던진다 — 조용히 넘어가면 배포하고 나서야 안다. */
function replaceAttribute(
  html: string,
  pattern: RegExp,
  value: string,
  label: string,
): string {
  if (!pattern.test(html)) {
    throw new Error(
      `[seo] index.html 에서 ${label} 태그를 못 찾았다. 태그를 고쳤으면 scripts/seo/generate.ts 도 같이 고칠 것.`,
    );
  }
  return html.replace(pattern, (_match, prefix: string) => `${prefix}${value}"`);
}

const outDir = path.resolve(process.cwd(), 'dist');

/*
  운영 여부는 vite.config.ts 가 VITE_ROBOTS 를 정할 때 쓴 것과 **같은 기준**이어야 한다.
  기준이 갈리면 구운 페이지의 robots 와 홈의 robots 가 서로 다른 말을 한다.
*/
const isProduction = process.env.VITE_APP_ENV === 'production';

// .env 는 끝의 / 를 안 붙이기로 돼 있지만, 붙어 들어와도 주소가 깨지지 않게 한 번 턴다.
const siteUrl = (process.env.VITE_SITE_URL ?? '').replace(/\/+$/, '');
if (!siteUrl) {
  throw new Error('[seo] VITE_SITE_URL 이 없다. dotenv 로 환경 파일을 지정할 것.');
}

/*
  robots.txt. public/robots.txt 가 전면 차단이고, 운영만 바꿔 낀다.
  **기본이 막힌 쪽이다** — 새 환경이 생겼을 때 손을 안 대면 색인되지 않는다.
*/
const productionRobots = path.join(outDir, PRODUCTION_ROBOTS);
if (isProduction) {
  copyFileSync(productionRobots, path.join(outDir, 'robots.txt'));
}
// 어느 환경이든 산출물에는 남기지 않는다. 남으면 /robots.production.txt 로 떠돈다.
rmSync(productionRobots, { force: true });

/*
  자리표시자를 채운다. **남아 있으면 던진다** — 치환이 덜 끝난 robots·sitemap 은 빌드도
  성공하고 화면도 멀쩡해서, 검색엔진이 알려줄 때까지 아무도 모른다.
*/
for (const file of FILLED_FILES) {
  const target = path.join(outDir, file);
  const filled = readFileSync(target, 'utf-8').replaceAll(PLACEHOLDER, siteUrl);
  if (filled.includes(PLACEHOLDER)) {
    throw new Error(`[seo] ${file} 의 ${PLACEHOLDER} 치환이 끝나지 않았다.`);
  }
  writeFileSync(target, filled, 'utf-8');
}

/*
  약관 라우트를 굽는다. index.html 을 바탕으로 robots·canonical·og:url 만 자기 것으로 바꾼다.
  번들은 같은 것을 물고 있어서 React 가 평소처럼 그 화면을 그린다.
*/
const baseHtml = readFileSync(path.join(outDir, 'index.html'), 'utf-8');

for (const route of BAKED_ROUTES) {
  /*
    운영이 아니면 사이트 전체가 noindex, nofollow 다(vite.config.ts 의 VITE_ROBOTS).
    거기에 follow 를 얹으면 색인 대상처럼 보이므로 운영에서만 값을 바꾼다.
  */
  let html = isProduction
    ? replaceAttribute(baseHtml, ROBOTS_TAG, route.robots, 'robots')
    : baseHtml;

  /*
    canonical·og:url 은 index.html 이 홈으로 박아 둔다. 그대로 복사하면 이 페이지가
    "내 정본은 홈" 이라고 말하는 셈이라 자기 주소로 고쳐 준다.
  */
  const absolute = `${siteUrl}${route.routePath}`;
  html = replaceAttribute(html, CANONICAL_TAG, absolute, 'canonical');
  html = replaceAttribute(html, OG_URL_TAG, absolute, 'og:url');

  const dir = path.join(outDir, route.routePath.replace(/^\//, ''));
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'index.html'), html, 'utf-8');
}

console.log(
  `[seo] robots.txt(${isProduction ? '운영' : '차단'}) + 자리표시자 ${String(FILLED_FILES.length)}개 + ${String(BAKED_ROUTES.length)}쪽 굽기 → ${siteUrl}`,
);
