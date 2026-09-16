import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'fs';
import path from 'path';

import { collectBoardUrls } from './board-source.ts';

/**
 * 게시판 사이트맵을 만든다. **배포가 아니라 주기(주 1회)로 돈다.**
 *
 * 사이트 빌드에 붙이지 않는 이유는 두 가지다. 글이 생기는 주기와 배포 주기가 다르고,
 * 붙이면 프론트 배포가 백엔드 가용성에 묶인다 — 앱 코드를 고쳐 올리려는데 API 장애로
 * 막히는 것은 말이 안 된다.
 *
 * 산출물은 전용 워커로 올라가고, Route 가 sitemap-auto-* 를 그 워커로 보낸다
 * (docs/cloudflare.md). medifinder 사이트맵과 같은 모양이다.
 */

/** 라우팅이 집어갈 이름. public/sitemap.xml 이 인덱스에서 이 이름을 문다. */
const FILE_NAME = 'sitemap-auto-board.xml';

/** 디렉터리 이름에 그대로 들어가므로 경로를 벗어날 수 있는 글자는 막는다. */
const SAFE_ENV = /^[a-z0-9][a-z0-9-]*$/;

/** 이 디렉터리에서 우리 것으로 간주하는 파일. 지울 때와 올릴 때 같은 기준을 쓴다. */
const OURS = /^sitemap[\w-]*\.xml$/;

/**
 * 산출물이 놓이는 디렉터리. 인자로 받은 곳 **아래에 환경별로 따로** 만든다.
 *
 *   out  +  production  →  out/hansapp-web_production_sitemap
 *
 * 환경을 이름에 박는 이유는 섞이면 알아챌 방법이 없기 때문이다. develop 으로 만든 것을
 * 운영 워커에 올려도 파일 이름은 똑같아서, 올라간 뒤에야 develop URL 이 들어 있는 것을 안다.
 */
function outputDir(base: string, appEnv: string): string {
  if (!SAFE_ENV.test(appEnv)) {
    throw new Error(
      `[sitemap-board] 환경 이름이 이상하다: "${appEnv}". 소문자·숫자·하이픈만 쓴다.`,
    );
  }
  return path.join(path.resolve(base), `hansapp-web_${appEnv}_sitemap`);
}

/**
 * 쓰기 전에 지난 산출물을 지운다.
 *
 * 올리는 쪽은 디렉터리를 통째로 보고 올린다. 파일 이름이 바뀌거나 조각 수가 줄면 지난 회차가
 * 남아서, 인덱스에 없는 사이트맵이 워커에 쌓이고 그 안의 URL 이 계속 살아 있게 된다.
 */
function clear(target: string): void {
  for (const name of readdirSync(target)) {
    if (OURS.test(name)) rmSync(path.join(target, name));
  }
}

const appEnv = process.env.VITE_APP_ENV ?? '';
const siteUrl = (process.env.VITE_SITE_URL ?? '').replace(/\/+$/, '');
const apiBaseUrl = (process.env.VITE_HANSAPP_BASE_URL ?? '').replace(/\/+$/, '');

if (!appEnv || !siteUrl || !apiBaseUrl) {
  throw new Error(
    '[sitemap-board] VITE_APP_ENV · VITE_SITE_URL · VITE_HANSAPP_BASE_URL 이 필요하다. dotenv 로 환경 파일을 지정할 것.',
  );
}

const target = outputDir(process.argv[2] ?? 'out', appEnv);
const urls = await collectBoardUrls(apiBaseUrl);

/*
  **0건이면 만들지 않는다.** 글이 있던 사이트맵을 빈 것으로 덮으면 색인이 빠지고, 되돌려도
  다시 잡히는 데 몇 주가 걸린다. 지난 회차가 그대로 살아 있는 편이 낫다 — medifinder 가
  --min-urls 로 잡는 것과 같은 방어다.

  **디렉터리를 비우기 전에 막는다.** 비운 뒤에 걸리면 지난 회차까지 날아간다.
*/
if (urls.length === 0) {
  throw new Error(
    `[sitemap-board] 실을 주소가 없다(${apiBaseUrl}). 게시판이나 공개 글이 없는지 확인할 것.`,
  );
}

const entries = urls
  .map(
    (url) =>
      `  <url>\n    <loc>${siteUrl}${url.path}</loc>${url.lastmod ? `\n    <lastmod>${url.lastmod}</lastmod>` : ''}\n  </url>`,
  )
  .join('\n');

mkdirSync(target, { recursive: true });
clear(target);
writeFileSync(
  path.join(target, FILE_NAME),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`,
  'utf-8',
);

console.log(`[sitemap-board] ${String(urls.length)}개 → ${path.join(target, FILE_NAME)}`);
