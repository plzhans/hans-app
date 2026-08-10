import { config } from 'dotenv';
import {
  exitIfVersionFlag,
  loadBuildInfo,
  requireSettings,
  resolveAppEnv,
} from '@hansapp/common';
import type { BuildInfo, ConfigSource } from '@hansapp/common';

import { loadServerConfig } from './config';

/**
 * **부팅의 최초 진입점.** main.ts 보다 먼저 평가된다 — instrument.ts(Sentry.init)가 DSN·환경·버전을
 * 여기서 가져가기 때문이다.
 *
 * Sentry 는 `@nestjs/core`·express·http 같은 계측 대상이 require 되기 **전에** init 돼야 한다.
 * 그래서 main.ts 최상단이 `import './instrument'` 이고, instrument 는 다시 이 파일을 import 한다.
 * 설정 로딩이 main.ts 본문(=모든 import 이후)에 남아 있으면 그 순서를 만들 수 없다.
 *
 * 모듈은 한 번만 평가되므로 **설정도 env 파일도 한 번만 읽힌다** — main.ts 는 여기서 만든
 * appConfig 를 그대로 가져다 쓴다.
 *
 * 여기서 무거운 것을 import 하면 안 된다. @hansapp/common 은 js-yaml·lodash.merge 만 쓰므로
 * Sentry 가 계측할 모듈(http·express·prisma)을 끌고 오지 않는다.
 */

// --version 이면 버전만 찍고 끝낸다. 서버를 띄우지 않는다.
// 반드시 loadEnv 앞이다. 버전을 물어보는 데 DB 접속정보까지 갖춰져 있어야 할 이유가 없다.
exitIfVersionFlag(__dirname);

/** 실행 환경(local|develop|production). Sentry environment 태그가 이 값이다. */
export const appEnv = resolveAppEnv();

// 하위 계층이 process.env.APP_ENV 를 직접 보는 곳이 있어 판별 결과를 되돌려 고정한다.
process.env.APP_ENV = appEnv;

/** 이 산출물의 신원(버전·커밋). Sentry release/태그로 올린다. */
export const buildInfo: BuildInfo = loadBuildInfo(__dirname);

// 설정 접근자 하나를 만든다. 계층형 .env(EnvSource) 위에 config/config.yaml + config.<환경>.yaml 을 얹은
// ConfigSource 다. EnvSource 를 확장하므로 하위 계층(requireString(cfg,...))에도 그대로 넘긴다.
// env 파일은 특정 앱이 소유하지 않는다 — server·cli 가 같은 DB 를 보므로 접속정보를 중복시키지 않는다.
export const appConfig: ConfigSource = loadServerConfig(
  __dirname,
  appEnv,
  config,
);

/*
  없으면 뜨면 안 되는 값. **DI 가 만들다 터지기 전에 여기서 먼저 막는다** — 빠진 것을 한 번에
  다 보여주고, Sentry 도 Nest 도 서기 전이라 메시지가 스택에 묻히지 않는다.

  auth.jwt.secret        토큰 서명키. 없으면 로그인·세션이 통째로 안 돈다.
  llm.answerSigningKey   답변 서명키. 없으면 직전 답변을 문맥으로 못 이어받고,
                         화면이 보낸 문장을 검증 없이 받는 길이 열린다.
  appSecretEncryption.v1 DB 에 잠긴 업체 키를 여는 마스터 키. 없으면 등록된 키를 못 연다.
*/
requireSettings(appConfig, [
  'auth.jwt.secret',
  'llm.answerSigningKey',
  'appSecretEncryption.v1',
]);
