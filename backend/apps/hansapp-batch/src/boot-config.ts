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
 * 여기서 가져가기 때문이다. Sentry 는 계측 대상 모듈이 require 되기 전에 init 돼야 한다.
 *
 * 모듈은 한 번만 평가되므로 설정도 env 파일도 한 번만 읽힌다 — main.ts 는 이걸 그대로 쓴다.
 * 여기서 무거운 것을 import 하면 안 된다(@hansapp/common 은 js-yaml·lodash.merge 뿐이다).
 */

// --version 이면 버전만 찍고 끝낸다. 배치를 실행하지 않는다.
// loadEnv 앞이어야 한다. 버전을 물어보는 데 DB 접속정보가 필요할 이유가 없다.
exitIfVersionFlag(__dirname);

/** 실행 환경(local|develop|production). Sentry environment 태그가 이 값이다. */
export const appEnv = resolveAppEnv();

// 하위 계층이 process.env.APP_ENV 를 직접 보는 곳이 있어 판별 결과를 되돌려 고정한다.
process.env.APP_ENV = appEnv;

/** 이 산출물의 신원(버전·커밋). Sentry release/태그로 올린다. */
export const buildInfo: BuildInfo = loadBuildInfo(__dirname);

// 설정 접근자(ConfigSource). config/config.yaml + config.<환경>.yaml 위에 계층형 .env 를 얹어 경로 게터로 읽고,
// EnvSource 를 확장하므로 시크릿을 flat env 로 읽는 기존 계층에도 그대로 넘어간다.
export const appConfig: ConfigSource = createConfigSource(
  __dirname,
  appEnv,
  config,
);
