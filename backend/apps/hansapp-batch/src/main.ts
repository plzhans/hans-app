// ⚠️ **이 import 가 항상 첫 줄이어야 한다.** Sentry 는 계측 대상 모듈(http·prisma)이 require 되기
// 전에 init 돼야 하고, 그러지 않으면 조용히 아무것도 계측되지 않는다.
// reflect-metadata(NestJS DI 가 데코레이터 메타데이터를 읽는 데 필요) 도 여기서 먼저 로드한다.
import { flushSentry, sentryEnabled, sentryStatusLine } from './instrument';
import { reportBootFailure } from '@hansapp/http-common';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { logConfigSummary } from '@hansapp/common';
import { BatchJobService, describeError } from '@hansapp/admin-application';

import { AppModule } from './app.module';
import { appConfig } from './boot-config';
import { BATCH_CONFIG, type BatchConfig } from './batch.config';
import { RUNNER } from './runner';
import { BatchScheduler } from './batch.scheduler';
import { BatchService } from './batch.service';
import { BATCH_JOBS, BATCH_JOB_NAMES, findBatchJob, type BatchJobDefinition } from './batch.jobs';

// --version 처리, 환경 판별, 설정(ConfigSource) 로딩은 boot-config.ts 가 한다.
// Sentry.init 이 DSN·환경·버전을 먼저 알아야 해서 모든 import 보다 앞서 돌아야 하기 때문이다.

/**
 * 배치 프로세스.
 *
 * 기본은 상주하며 **잡마다 자기 크론 시각에** 실행한다(주기는 전부 설정값이다).
 *
 * `--once`        등록된 잡을 정의 순서대로 한 번씩 돌리고 끝난다.
 *                 외부 스케줄러(k8s CronJob 등)를 쓸 때 이 모드를 쓴다.
 * `--job <이름>`  그 잡 하나만 돌린다(--once 를 함께 줄 필요 없다). 여러 번 줄 수 있다.
 * `--force`       신선도 판정을 무시한다.
 * `--debug`       병원 하나하나의 진행을 찍는다. 8만 건이면 로그가 어마어마하니 평소엔 끈다.
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('Batch');

  const source = appConfig;

  // 접속 대상·서비스키(마스킹)를 한 줄씩 남긴다 — 배치가 어느 DB/키로 도는지 확인.
  logConfigSummary(source, (l) => logger.log(l));
  // Sentry 가 켜졌는지도 같이 남긴다. 조용히 꺼져 있는 게 최악이다.
  logger.log(sentryStatusLine);

  const force = process.argv.includes('--force');
  const debug = process.argv.includes('--debug');

  // --job 은 이름을 검증해서 받는다. 오타를 조용히 넘기면 아무 잡도 안 돌고 끝난다.
  const selected = readJobNames();
  const once = process.argv.includes('--once') || selected.length > 0;

  // debug 레벨에 병원 단위 진행이 찍힌다. 기본은 단계·페이지 단위(log)만 본다.
  const logLevels = debug
    ? (['error', 'warn', 'log', 'debug'] as const)
    : (['error', 'warn', 'log'] as const);

  /*
    **두 모드를 아예 갈라서 띄운다.** 일회 실행은 HTTP 가 필요 없고, 상주는 포트를 여는 것
    자체가 "한 컴퓨터에 하나" 가드다 — --job·--once 까지 포트를 열면 상주가 도는 중에
    손으로 한 번 돌리는 정상적인 일이 막힌다(그 겹침은 Redis 잡 락이 따로 맡는다).
  */
  if (once) {
    const app = await NestFactory.createApplicationContext(AppModule.forRoot(source), {
      logger: [...logLevels],
    });
    const jobs = app.get(BatchJobService);
    jobs.setRunner(RUNNER);
    logger.log(`🏷  Runner : ${RUNNER.hostname} pid=${RUNNER.pid} ${RUNNER.version}`);

    /*
      **일회 실행도 마스터에 잡을 등록한다.** 크론을 안 걸 뿐 잡은 실재하고, 행이 없으면
      회차 기록이 "없는 행 갱신" 으로 실패한다(새 잡을 --job 으로 처음 돌릴 때 그렇다).
      다음 실행 시각은 안 넘긴다 — 그건 크론을 등록한 프로세스만 아는 값이다.
    */
    const config = app.get<BatchConfig>(BATCH_CONFIG);
    for (const definition of BATCH_JOBS) {
      await jobs.register({
        job: definition.name,
        description: definition.description,
        category: definition.category,
        cronExpression: config.crons[definition.name],
        timeZone: config.timeZone,
      });
    }

    try {
      const batch = app.get(BatchService);
      // readJobNames 가 이미 이름을 검증했으므로 여기서는 반드시 찾아진다.
      const targets = selected.length
        ? selected.map((name) => findBatchJob(name) as BatchJobDefinition)
        : BATCH_JOBS;

      // 순서대로 한 번씩. 한 잡이 실패해도 나머지는 돈다 — 잡끼리 의존이 없다.
      for (const definition of targets) {
        try {
          await batch.run(definition, { force });
        } catch (error) {
          logger.error(`${definition.name} failed`, error);
        }
      }
    } finally {
      await app.close();
      // --once 는 여기서 프로세스가 끝난다. Sentry 는 이벤트를 비동기로 보내므로
      // flush 없이 나가면 방금 잡은 에러가 통째로 날아간다.
      await flushSentry();
    }
    return;
  }

  const app = await NestFactory.create(AppModule.forRoot(source), { logger: [...logLevels] });
  app.get(BatchJobService).setRunner(RUNNER);
  logger.log(`🏷  Runner : ${RUNNER.hostname} pid=${RUNNER.pid} ${RUNNER.version}`);

  /*
    **크론보다 포트를 먼저 잡는다.** 순서가 반대면 두 번째 프로세스가 크론을 등록하고
    마스터(batch_job)를 덮어쓴 뒤에야 포트 충돌로 죽는다 — 그 사이 먼저 뜬 프로세스의
    등록 정보가 망가진다.
  */
  const { webPort, bindAddress } = app.get<BatchConfig>(BATCH_CONFIG);
  try {
    await app.listen(webPort, bindAddress);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      // 이 컴퓨터에 배치가 이미 떠 있다. 겹쳐 뜨면 크론이 두 벌 돌고 이력이 어지러워진다.
      throw new Error(
        `Port ${webPort} is already in use — a batch process is already running on this machine.` +
          ' Stop it first, or change apps-batch.web.port.',
      );
    }
    throw error;
  }
  logger.log(`🌐 Health  : http://${bindAddress}:${webPort}/health`);

  await app.get(BatchScheduler).register();
  app.enableShutdownHooks();
  logger.log('Batch is idle. It runs at the cron time.');
}

/**
 * `--job hira --job nmc` 를 이름 배열로 푼다.
 *
 * **없는 이름이면 즉시 죽는다.** 조용히 넘기면 아무 잡도 안 돌고 성공한 것처럼 끝난다 —
 * 오타 하나로 그날 적재가 통째로 빠지는 게 제일 알아채기 어렵다.
 */
function readJobNames(): string[] {
  const names: string[] = [];
  const argv = process.argv;

  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== '--job') continue;

    const value = argv[i + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`--job needs a job name. One of: ${BATCH_JOB_NAMES.join(', ')}`);
    }
    if (!findBatchJob(value)) {
      throw new Error(`Unknown job: ${value}. One of: ${BATCH_JOB_NAMES.join(', ')}`);
    }
    names.push(value);
  }

  return names;
}

bootstrap().catch(async (error: unknown) => {
  console.error(describeError(error));
  // 부팅/실행이 통째로 실패한 경우다. 이건 무조건 알아야 하므로 Sentry 에 남기고,
  // 전송이 끝난 뒤에 종료한다(exit 이 먼저면 이벤트가 유실된다).
  //
  // **세 앱이 같은 헬퍼를 쓴다.** level·태그가 앱마다 갈리면 "부팅 실패" 알림 규칙에서
  // 한 앱만 조용히 빠진다 — 그게 제일 알아채기 어려운 구멍이다.
  await reportBootFailure(error, sentryEnabled);
  process.exit(1);
});
