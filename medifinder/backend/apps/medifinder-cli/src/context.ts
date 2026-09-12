import { INestApplicationContext, LogLevel } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MedifinderApplicationModule, type MedifinderConfig } from '@medifinder/admin-application';

/**
 * CLI 는 커맨드 파싱과 출력만 담당한다. 실제 로직은 응용 계층이 소유하고 NestJS DI 로
 * 조립된다. 여기서 애플리케이션 컨텍스트만 띄워 서비스를 꺼내 쓴다. HTTP 서버는 뜨지 않는다.
 *
 * 설정은 완성된 객체로 넘긴다. 응용 계층이 부팅 시점에 자기 몫을 검증하므로,
 * 빠진 값이 있으면 컨텍스트를 만드는 시점에 즉시 실패한다.
 */
export async function withApplicationContext<T>(
  config: MedifinderConfig,
  run: (context: INestApplicationContext) => Promise<T>,
  options: { verbose?: boolean } = {},
): Promise<T> {
  // 기본이 log 까지인 이유는 이 CLI 의 유일한 커맨드가 몇 분씩 걸리기 때문이다.
  // 진행 표시가 없으면 멈춘 것과 구분되지 않는다.
  const logger: LogLevel[] =
    options.verbose === false ? ['warn', 'error'] : ['log', 'warn', 'error'];

  const context = await NestFactory.createApplicationContext(
    MedifinderApplicationModule.forRoot(config),
    { logger },
  );

  try {
    return await run(context);
  } finally {
    await context.close();
  }
}
