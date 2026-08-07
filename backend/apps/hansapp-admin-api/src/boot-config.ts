import { config } from 'dotenv';
import {
  createConfigSource,
  exitIfVersionFlag,
  loadBuildInfo,
  resolveAppEnv,
} from '@hansapp/common';
import type { BuildInfo, ConfigSource } from '@hansapp/common';

/**
 * **부팅의 최초 진입점.** main.ts 보다 먼저 평가된다 — instrument.ts(Sentry.init)가 DSN·환경·버전을
 * 여기서 가져가기 때문이다.
 *
 * Sentry 는 `@nestjs/core`·express·http 같은 계측 대상이 require 되기 **전에** init 돼야 한다.
 * 그래서 main.ts 최상단이 `import './instrument'` 이고, instrument 는 다시 이 파일을 import 한다.
 * 설정 로딩이 main.ts 본문(=모든 import 이후)에 남아 있으면 그 순서를 만들 수 없다.
 *
 * 여기서 무거운 것을 import 하면 안 된다. @hansapp/common 은 js-yaml·lodash.merge 만 쓰므로
 * Sentry 가 계측할 모듈(http·express·prisma)을 끌고 오지 않는다.
 */

// --version 이면 버전만 찍고 끝낸다. 서버를 띄우지 않는다.
// 반드시 env 로딩 앞이다 — 버전을 물어보는 데 DB 접속정보까지 갖춰져 있어야 할 이유가 없다.
exitIfVersionFlag(__dirname);

/** 실행 환경(local|develop|production). Sentry environment 태그가 이 값이다. */
export const appEnv = resolveAppEnv();

// 하위 계층이 process.env.APP_ENV 를 직접 보는 곳이 있어 판별 결과를 되돌려 고정한다.
process.env.APP_ENV = appEnv;

/** 이 산출물의 신원(버전·커밋). Sentry release/태그로 올린다. */
export const buildInfo: BuildInfo = loadBuildInfo(__dirname);

// 설정 접근자. 계층형 .env 위에 config/config.<환경>.yaml 을 얹은 ConfigSource 다.
// **설정 파일은 hansapp-api 와 같은 것을 읽는다** — DB·Redis 접속정보를 앱마다 중복시키지 않는다.
// 이 앱만의 값은 최상위 키 `apps-admin-api`·`admin` 아래에 있다.
export const appConfig: ConfigSource = createConfigSource(
  __dirname,
  appEnv,
  config,
);
