// NestJS DI 가 데코레이터 메타데이터를 읽으려면 가장 먼저 로드돼야 한다.
import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { config } from 'dotenv';
import {
  createConfigSource,
  exitIfVersionFlag,
  resolveAppEnv,
} from '@hansapi/common';
import { describeError } from '@hansapi/admin-application';

import { AppModule } from './app.module';
import { BatchScheduler } from './batch.scheduler';
import { BatchService } from './batch.service';

// --version 이면 버전만 찍고 끝낸다. 배치를 실행하지 않는다.
// loadEnv 앞이어야 한다. 버전을 물어보는 데 DB 접속정보가 필요할 이유가 없다.
exitIfVersionFlag(__dirname);

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

  const appEnv = resolveAppEnv();
  process.env.APP_ENV = appEnv;
  // ConfigSource 로 만든다(EnvSource 를 확장). 하위 계층은 EnvSource 로 받아 그대로 쓰고,
  // getX 가 필요한 계층만 경계에서 asConfigSource 로 좁힌다.
  const source = createConfigSource(__dirname, appEnv, config);

  const once = process.argv.includes('--once');
  const force = process.argv.includes('--force');
  const debug = process.argv.includes('--debug');

  const app = await NestFactory.createApplicationContext(
    AppModule.forRoot(source),
    {
      // debug 레벨에 병원 단위 진행이 찍힌다. 기본은 단계·페이지 단위(log)만 본다.
      logger: debug
        ? ['error', 'warn', 'log', 'debug']
        : ['error', 'warn', 'log'],
    },
  );

  if (once) {
    try {
      await app.get(BatchService).runDaily(force);
    } finally {
      await app.close();
    }
    return;
  }

  app.get(BatchScheduler).register();
  app.enableShutdownHooks();
  logger.log('배치 대기 중. 크론 시각에 실행된다.');
}

bootstrap().catch((error: unknown) => {
  console.error(describeError(error));
  process.exit(1);
});
