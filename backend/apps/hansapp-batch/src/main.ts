// ⚠️ **이 import 가 항상 첫 줄이어야 한다.** Sentry 는 계측 대상 모듈(http·prisma)이 require 되기
// 전에 init 돼야 하고, 그러지 않으면 조용히 아무것도 계측되지 않는다.
// reflect-metadata(NestJS DI 가 데코레이터 메타데이터를 읽는 데 필요) 도 여기서 먼저 로드한다.
import * as Sentry from '@sentry/nestjs';
import { flushSentry, sentryEnabled, sentryStatusLine } from './instrument';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { logConfigSummary } from '@hansapp/common';
import { describeError } from '@hansapp/admin-application';

import { AppModule } from './app.module';
import { appConfig } from './boot-config';
import { BatchScheduler } from './batch.scheduler';
import { BatchService } from './batch.service';

// --version 처리, 환경 판별, 설정(ConfigSource) 로딩은 boot-config.ts 가 한다.
// Sentry.init 이 DSN·환경·버전을 먼저 알아야 해서 모든 import 보다 앞서 돌아야 하기 때문이다.

/**
 * 배치 프로세스.
 *
 * 기본은 상주하며 크론(기본 매일 04:00)이 돌 때마다 단계를 순서대로 실행한다.
 * `--once`  한 번만 돌고 끝난다. 외부 스케줄러(k8s CronJob 등)를 쓸 때 이 모드를 쓴다.
 * `--force` 신선도 판정을 무시한다.
 * `--debug` 병원 하나하나의 진행을 찍는다. 8만 건을 돌리면 로그가 어마어마하니 평소엔 끈다.
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('Batch');

  const source = appConfig;

  // 접속 대상·서비스키(마스킹)를 한 줄씩 남긴다 — 배치가 어느 DB/키로 도는지 확인.
  logConfigSummary(source, (l) => logger.log(l));
  // Sentry 가 켜졌는지도 같이 남긴다. 조용히 꺼져 있는 게 최악이다.
  logger.log(sentryStatusLine);

  const once = process.argv.includes('--once');
  const force = process.argv.includes('--force');
  const debug = process.argv.includes('--debug');

  const app = await NestFactory.createApplicationContext(AppModule.forRoot(source), {
    // debug 레벨에 병원 단위 진행이 찍힌다. 기본은 단계·페이지 단위(log)만 본다.
    logger: debug ? ['error', 'warn', 'log', 'debug'] : ['error', 'warn', 'log'],
  });

  if (once) {
    try {
      await app.get(BatchService).runDaily(force);
    } finally {
      await app.close();
      // --once 는 여기서 프로세스가 끝난다. Sentry 는 이벤트를 비동기로 보내므로
      // flush 없이 나가면 방금 잡은 에러가 통째로 날아간다.
      await flushSentry();
    }
    return;
  }

  app.get(BatchScheduler).register();
  app.enableShutdownHooks();
  logger.log('배치 대기 중. 크론 시각에 실행된다.');
}

bootstrap().catch((error: unknown) => {
  console.error(describeError(error));
  // 부팅/실행이 통째로 실패한 경우다. 이건 무조건 알아야 하므로 Sentry 에 남기고,
  // 전송이 끝난 뒤에 종료한다(exit 이 먼저면 이벤트가 유실된다).
  if (sentryEnabled) {
    Sentry.captureException(error);
  }
  void flushSentry().finally(() => process.exit(1));
});
