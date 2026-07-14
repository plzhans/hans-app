import {
  DynamicModule,
  INestApplicationContext,
  LogLevel,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { EnvSource } from '@hansapi/common';
import { AdminApplicationModule } from '@hansapi/admin-application';
import { DataModule } from '@hansapi/data';

/**
 * CLI 는 커맨드 파싱과 출력만 담당한다. 실제 로직은 응용·데이터 계층이 소유하고
 * NestJS DI 로 조립된다. 여기서 애플리케이션 컨텍스트만 띄워 서비스를 꺼내 쓴다.
 * HTTP 서버는 뜨지 않는다.
 *
 * 설정은 EnvSource 로 넘긴다. 각 계층이 자기 설정을 뽑고 검증하므로,
 * 필요한 설정이 없으면 컨텍스트를 만드는 시점에 즉시 실패한다.
 */
async function withContext<T>(
  module: DynamicModule,
  run: (context: INestApplicationContext) => Promise<T>,
  verbose: boolean,
  debug: boolean,
): Promise<T> {
  // debug 를 켜야 병원 하나하나의 로그(logger.debug)가 보인다. 기본은 진행 요약만 낸다 —
  // 8만 병원 × 11 오퍼레이션이면 88만 줄이라 켜두면 터미널이 무의미해진다.
  const logger: LogLevel[] = debug
    ? ['debug', 'log', 'warn', 'error']
    : verbose
      ? ['log', 'warn', 'error']
      : ['warn', 'error'];

  const context = await NestFactory.createApplicationContext(module, {
    logger,
  });

  try {
    return await run(context);
  } finally {
    await context.close();
  }
}

/**
 * 공공데이터 API 를 쓰는 커맨드용. 조회·sync 가 여기에 해당한다.
 * 서비스키가 없으면 컨텍스트 생성 시점에 실패한다.
 */
export async function withAdminContext<T>(
  source: EnvSource,
  run: (context: INestApplicationContext) => Promise<T>,
  options: { verbose?: boolean; debug?: boolean } = {},
): Promise<T> {
  return withContext(
    AdminApplicationModule.forRoot(source),
    run,
    options.verbose === true,
    options.debug === true,
  );
}

/**
 * DB 만 쓰는 커맨드용. 마이그레이션이 여기에 해당한다.
 *
 * 공공데이터 설정을 요구하지 않는다. 마이그레이션은 외부 API 와 아무 상관이 없으므로
 * 서비스키가 없어도 돌아야 한다. 그래서 admin 컨텍스트를 쓰지 않는다.
 */
export async function withDataContext<T>(
  source: EnvSource,
  run: (context: INestApplicationContext) => Promise<T>,
): Promise<T> {
  return withContext(DataModule.forRoot(source), run, false, false);
}
