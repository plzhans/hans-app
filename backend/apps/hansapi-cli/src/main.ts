#!/usr/bin/env node
// NestJS DI 가 데코레이터 메타데이터를 읽으려면 가장 먼저 로드돼야 한다.
import 'reflect-metadata';

import { Command } from 'commander';
import { config } from 'dotenv';
import {
  APP_ENVS,
  DEFAULT_APP_ENV,
  ConfigSource,
  createConfigSource,
  exitIfVersionFlag,
  resolveAppEnv,
} from '@hansapi/common';

import { describeError } from '@hansapi/admin-application';

import { dbCommand } from './commands/db';
import { syncStatusCommand } from './commands/stage';
import { hiraCommand } from './commands/hira';
import { healthcareCommand } from './commands/healthcare';
import { hiraNmcCommand } from './commands/hira-nmc';
import { i18nCommand } from './commands/i18n';
import { nmcCommand } from './commands/nmc';
import { esCommand } from './commands/es';
import { appCommand } from './commands/app';
import { userCommand } from './commands/user';
import { jwtCommand } from './commands/jwt';
import { addExamples, localizeHelp } from './help';

/**
 * env 파일을 커맨드 실행 전에 로드한다.
 *
 * commander 의 옵션 파싱을 기다리면 늦다. db 커맨드가 prisma 를 자식 프로세스로 띄우고,
 * sync 커맨드가 Nest 컨텍스트를 만들 때 이미 process.env 가 채워져 있어야 하기 때문이다.
 * 그래서 argv 에서 --env 만 먼저 직접 읽는다.
 */
function bootstrapEnv(): ConfigSource {
  const index = process.argv.indexOf('--env');
  const explicit = index >= 0 ? process.argv[index + 1] : undefined;

  const appEnv = resolveAppEnv(explicit);
  // 자식 프로세스(prisma)도 같은 환경을 보도록 물려준다.
  process.env.APP_ENV = appEnv;
  // 설정 접근자(ConfigSource). config/<환경>.yaml + 환경변수(__ 계층)를 병합해 경로 게터로 읽고,
  // EnvSource 를 확장하므로 시크릿을 flat env 로 읽는 기존 계층에도 그대로 넘어간다.
  return createConfigSource(__dirname, appEnv, config);
}

// --version 이면 버전만 찍고 끝낸다.
// env 로딩(bootstrapEnv) 앞이어야 한다. 버전을 물어보는 데 DB 접속정보가 필요할 이유가 없고,
// env 파일이 없는 머신에서도 "이게 무슨 빌드냐" 는 답할 수 있어야 한다.
exitIfVersionFlag(__dirname);

let envSource: ConfigSource;
try {
  envSource = bootstrapEnv();
} catch (error) {
  // 잘못된 환경 이름이나 없는 env 파일. 스택 트레이스는 도움이 안 되므로 메시지만 낸다.
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const program = new Command()
  .name('hansapi-cli')
  .description('공공데이터 API 조회·적재와 DB 스키마 관리를 위한 커맨드')
  .option(
    '--env <name>',
    `대상 환경. ${APP_ENVS.join(' | ')} 중 하나. config/<환경>/<환경>.env 를 읽는다`,
    DEFAULT_APP_ENV,
  )
  .option('--pretty', 'JSON 응답에 색을 입혀 출력한다 (TTY 에서만)')
  .addCommand(nmcCommand(envSource))
  .addCommand(hiraCommand(envSource))
  .addCommand(hiraNmcCommand(envSource))
  .addCommand(healthcareCommand(envSource))
  .addCommand(i18nCommand(envSource))
  .addCommand(dbCommand(envSource))
  .addCommand(syncStatusCommand(envSource))
  .addCommand(esCommand(envSource))
  .addCommand(appCommand(envSource))
  .addCommand(userCommand(envSource))
  .addCommand(jwtCommand(envSource));

addExamples(program, [
  `hansapi-cli db status                     # 현재 환경: ${envSource.env}`,
  'hansapi-cli db status --env prod          # 운영 DB 확인',
  'hansapi-cli nmc hospital sync --full',
]);

// 커맨드 트리를 다 만든 뒤 호출해야 하위 커맨드까지 적용된다.
localizeHelp(program);

program.parseAsync(process.argv).catch((error: unknown) => {
  // 에러 해석은 응용 계층이 한다. CLI 는 출력만 한다.
  console.error(describeError(error));
  process.exitCode = 1;
});
