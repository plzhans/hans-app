import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { resolveAppEnv } from '@hansapi/common';
import { config as loadDotenv } from 'dotenv';
import { loadServerConfig } from './config';
import { buildOpenApiDocument, parseServersSpec } from './swagger';

// 스펙을 내보낼 기본 경로. 레포 루트 기준 docs/openapi/openapi_hansapi.json 이다.
// __dirname 은 dev(src)/prod(dist) 모두 backend/apps/hansapi-server/{src|dist} 이므로
// 4단계 상위가 레포 루트가 된다.
const DEFAULT_OUT = resolve(
  __dirname,
  '../../../../docs/openapi/openapi_hansapi.json',
);

/**
 * 출력 경로/파일명을 결정한다(옵셔널, 다음 준비용).
 * 우선순위: CLI 인자(--out <path> | -o <path> | --out=<path> | 위치 인자) >
 *           OPENAPI_OUT 환경변수 > 기본 경로(DEFAULT_OUT).
 * 상대 경로는 실행 위치(cwd) 기준으로 해석한다.
 */
function resolveOutPath(): string {
  const args = process.argv.slice(2);
  const flagIdx = args.findIndex((a) => a === '--out' || a === '-o');
  const eqArg = args.find((a) => a.startsWith('--out='));
  const positional = args.find((a) => !a.startsWith('-'));
  const raw =
    (flagIdx >= 0 ? args[flagIdx + 1] : undefined) ??
    (eqArg ? eqArg.slice('--out='.length) : undefined) ??
    positional ??
    process.env.OPENAPI_OUT;
  return raw ? resolve(process.cwd(), raw) : DEFAULT_OUT;
}

/**
 * servers 오버라이드를 CLI 인자에서 읽는다(있으면 OPENAPI_SERVERS env·기본값을 대체).
 * - 반복 지정:  --server "url|설명"  --server "url2|설명2"
 * - 한 번에:    --servers "url|설명;url2|설명2"   (env 와 동일한 포맷)
 * 설명(|...)은 생략 가능(생략 시 url 을 설명으로 사용). 아무 인자도 없으면 undefined.
 */
function resolveServersArg(): ReturnType<typeof parseServersSpec> {
  const args = process.argv.slice(2);
  const entries: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if ((a === '--server' || a === '--servers') && args[i + 1]) {
      entries.push(args[++i]);
    } else if (a.startsWith('--server=')) {
      entries.push(a.slice('--server='.length));
    } else if (a.startsWith('--servers=')) {
      entries.push(a.slice('--servers='.length));
    }
  }
  return parseServersSpec(entries.join(';'));
}

/**
 * 서버를 띄우지 않고 OpenAPI(JSON) 스펙만 생성해 파일로 내보낸다.
 * preview 모드로 앱을 만들어 컨트롤러/라우트 메타데이터만 스캔하므로
 * Prisma $connect(onModuleInit) 등 provider 생명주기가 실행되지 않아 DB 없이도 동작한다.
 */
async function generate(): Promise<void> {
  // 스펙만 뽑을 때도 모듈 그래프를 구성하려면 설정이 필요하다. DB 에 연결하지는 않는다.
  const appConfig = loadServerConfig(__dirname, resolveAppEnv(), loadDotenv);

  const app = await NestFactory.create(AppModule.forRoot(appConfig), {
    // provider 를 실제 인스턴스화하지 않고 모듈 그래프만 구성한다(DB 연결 회피).
    preview: true,
    logger: false,
  });

  const document = buildOpenApiDocument(app, { servers: resolveServersArg() });
  await app.close();

  const outPath = resolveOutPath();
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(document, null, 2)}\n`, 'utf-8');

  // 앱 로거를 끈 상태(logger:false)라 Logger 대신 console 로 결과를 알린다.
  console.log(`✅ OpenAPI spec exported to ${outPath}`);
}

generate().catch((error) => {
  console.error('❌ Failed to generate OpenAPI spec', error);
  process.exit(1);
});
