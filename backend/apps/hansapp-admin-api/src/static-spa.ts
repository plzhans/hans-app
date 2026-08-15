import { existsSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { isAbsolute, join, resolve } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import type { ConfigSource } from '@hansapp/common';

/**
 * 관리자 SPA 를 **같은 오리진에서** 같이 내보낸다.
 *
 * 관리자 콘솔은 이 API 하나만 부른다. 따로 띄우면 도메인·인증서·CORS 가 한 벌씩 더 생기고,
 * 화면과 API 의 버전이 따로 움직여 "화면은 새것인데 API 는 옛것" 인 창이 열린다.
 * 한 이미지에 같이 담으면 태그 하나가 둘의 버전이고, 롤백도 같이 돌아간다.
 *
 * 앞단 nginx 는 TLS 와 IP 제한만 하고 통째로 프록시한다 — 정적파일 경로를 따로 알 필요가 없다.
 *
 * **API 경로를 가리지 않는다.** Nest 라우터가 먼저 서고 여기서 붙는 미들웨어는 그 뒤다.
 * 그래서 `/api/*`·`/auth/*` 는 컨트롤러가 가져가고, 남는 것만 정적파일로 간다.
 */
const API_PREFIXES = ['/api/', '/auth/', '/health', '/docs', '/openapi'];

const STATIC_DIR_KEY = 'apps-admin-api.web.staticDir';

/**
 * 이 서버가 SPA 를 직접 내보내는지.
 *
 * **CORS 로그 문구가 이 값으로 갈린다** — 같이 내보내면 화면이 같은 오리진이라 CORS 가
 * 아예 필요 없고, 아니면 화면이 다른 어딘가에 있다는 뜻이라 이야기가 달라진다.
 */
export function isAdminSpaServed(config: ConfigSource): boolean {
  return config.getStringOrDefault(STATIC_DIR_KEY) !== '';
}

/**
 * @param dir 정적파일 디렉터리. 상대경로면 cwd 기준(컨테이너는 /app).
 *            비어 있으면 아무것도 안 붙인다 — 로컬은 Vite dev server 로 따로 띄운다.
 * @returns 부팅 로그에 찍을 한 줄.
 */
export function serveAdminSpa(app: NestExpressApplication, config: ConfigSource): string {
  const raw = config.getStringOrDefault(STATIC_DIR_KEY);
  if (!raw) {
    return `🖥  SPA    : not served — the console runs separately (${STATIC_DIR_KEY} is empty)`;
  }

  const dir = isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
  const index = join(dir, 'index.html');
  /*
    **없으면 뜨지 않는다.** 조용히 넘어가면 관리자 화면만 404 인 채로 서버는 정상으로
    보이고, 그 사실이 사람이 브라우저를 열 때까지 안 드러난다. 이미지에 굽는 값이라
    경로가 틀렸다는 건 빌드가 잘못됐다는 뜻이다.
  */
  if (!existsSync(index)) {
    throw new Error(
      `Admin SPA not found: ${index}\n` +
        'Check apps-admin-api.web.staticDir (leave it empty to not serve the SPA).',
    );
  }

  /*
    해시가 붙은 자산(assets/index-<hash>.js)은 내용이 바뀌면 이름이 바뀐다 — 오래 캐시해도
    안전하다. index.html 은 그 이름들을 가리키는 지도라 캐시하면 안 된다. 배포 직후
    브라우저가 옛 지도를 들고 새 자산을 찾다가 빈 화면이 된다.
  */
  app.useStaticAssets(dir, {
    index: false,
    setHeaders: (res: ServerResponse, filePath: string) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  });

  /*
    **SPA 폴백.** 라우팅을 브라우저가 하므로 /settings/llm 같은 주소로 새로고침하면 서버에는
    그런 파일이 없다. index.html 을 돌려주고 나머지는 화면이 판단하게 한다.

    API 접두사는 제외한다 — 없는 API 를 부르면 404 JSON 이 와야지 HTML 이 오면 안 된다.
    그쪽은 클라이언트가 파싱하다 엉뚱한 곳에서 죽는다.
  */
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (API_PREFIXES.some((prefix) => req.path.startsWith(prefix))) {
      return next();
    }
    res.sendFile(index);
  });

  return `🖥  SPA    : ${dir}`;
}
