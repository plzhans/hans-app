import {
  DynamicModule,
  INestApplicationContext,
  LogLevel,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { EnvSource } from '@hansapi/common';
import { AdminApplicationModule, I18nModule } from '@hansapi/admin-application';
import { DataModule } from '@hansapi/data';
import { SearchModule } from '@hansapi/search';

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
 *
 * 서비스키는 **선택이다** — admin 계층에 외부 API 를 안 쓰는 커맨드(ES 색인 등)도 있어 키 없이도
 * 뜬다(서버와 같은 방침). 키가 정말 필요한 sync 는 호출 시점에 401/403·E0001 로 드러난다.
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

/**
 * 번역 커맨드용. DB 만 쓴다.
 *
 * **admin 컨텍스트를 쓰지 않는 이유는 공공데이터 서비스키다.** 번역은 원문을 DB 에서 뽑고
 * 번역을 DB 에 넣을 뿐, HIRA·NMC API 를 때리지 않는다. 서비스키가 없다고 번역 export 가
 * 못 돌 이유가 없다. 요구하는 게 적을수록 돌릴 수 있는 곳이 많다.
 */
/**
 * 검색(Elasticsearch) 커맨드용. DB + ES 만 쓴다.
 *
 * 공공데이터 서비스키를 요구하지 않는다 — 색인은 우리 DB(healthcare_*)를 읽어 ES 에 밀어 넣을 뿐
 * 외부 API 를 때리지 않는다. 그래서 admin 컨텍스트가 아니라 SearchModule 만 띄운다.
 * (SearchModule 이 내부에서 DataModule 을 물려 PrismaService 를 얻는다.)
 */
export async function withSearchContext<T>(
  source: EnvSource,
  run: (context: INestApplicationContext) => Promise<T>,
  options: { verbose?: boolean } = {},
): Promise<T> {
  return withContext(
    SearchModule.forRoot(source),
    run,
    options.verbose !== false,
    false,
  );
}

export async function withI18nContext<T>(
  source: EnvSource,
  run: (context: INestApplicationContext) => Promise<T>,
  options: { verbose?: boolean } = {},
): Promise<T> {
  return withContext(
    I18nModule.forRoot(source),
    run,
    options.verbose !== false,
    false,
  );
}
