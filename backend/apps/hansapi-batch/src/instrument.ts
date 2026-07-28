// NestJS DI 가 데코레이터 메타데이터를 읽으려면 가장 먼저 로드돼야 한다(@sentry/nestjs 의 데코레이터 포함).
import 'reflect-metadata';

import * as Sentry from '@sentry/nestjs';

import { appConfig, buildInfo } from './boot-config';

/**
 * Sentry 계측. **main.ts 의 첫 import 여야 한다.**
 *
 * Sentry 는 http·prisma 같은 모듈을 monkey-patch 한다. 그 모듈이 Sentry.init 보다 먼저 require 되면
 * **조용히 아무것도 계측되지 않는다**(에러가 안 나서 더 위험하다). 그래서 이 파일만 따로 둔다.
 *
 * DSN 은 config/config.<환경>.yaml 의 `batch.sentry.dsn` — **api-server 와 다른 Sentry 프로젝트다.**
 * 배치는 "한 번 실패해도 즉시 알림", API 는 "임계치 초과 시 알림" 으로 알림 성격이 달라서 나눴다.
 * 비어 있으면 init 을 하지 않는다(이후 captureException 등은 전부 no-op).
 */

const dsn = appConfig.getStringOrDefault('batch.sentry.dsn');
const tracesSampleRate = appConfig.getNumberOrDefault(
  'batch.sentry.tracesSampleRate',
  0,
);

if (dsn) {
  Sentry.init({
    dsn,
    // 이벤트를 환경별로 가른다(local/develop/production 이 한 프로젝트에 들어와도 섞이지 않는다).
    environment: appConfig.env,
    // 어느 산출물에서 났는지. tagVersion 은 0.0.1-a1b2c3d 형태로 docker 태그와 같은 문자열이다.
    release: buildInfo.tagVersion,
    tracesSampleRate,
    // 숫자 버전만으로는 어느 커밋인지 모른다. 커밋·브랜치를 모든 이벤트에 붙인다.
    initialScope: {
      tags: { sha: buildInfo.sha, branch: buildInfo.branch },
    },
  });
}

/** Sentry 가 켜졌는지 여부. 종료 직전 flush 를 할지 판단하는 데 쓴다. */
export const sentryEnabled = Boolean(dsn);

/** 부팅 로그 한 줄. 조용히 꺼져 있는 게 최악이라 로그에 남긴다. */
export const sentryStatusLine = dsn
  ? `🛰  Sentry : ${appConfig.env} / ${buildInfo.tagVersion} (traces ${tracesSampleRate})`
  : '🛰  Sentry : 비활성 — batch.sentry.dsn 없음';

/**
 * 남은 이벤트를 전송하고 기다린다. **배치는 끝나면 프로세스가 죽는다** —
 * Sentry 는 이벤트를 비동기로 보내므로 flush 없이 exit 하면 마지막 에러가 통째로 날아간다.
 * (상주 모드의 서버에는 필요 없다.)
 */
export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!sentryEnabled) {
    return;
  }
  await Sentry.flush(timeoutMs);
}
