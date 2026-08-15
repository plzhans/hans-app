// Nest 데코레이터(@sentry/nestjs 것 포함)가 Reflect.defineMetadata 를 쓴다. 폴리필이 먼저다.
import 'reflect-metadata';

import * as Sentry from '@sentry/nestjs';

import { appConfig, buildInfo } from './boot-config';

/**
 * Sentry 계측. **main.ts 의 첫 import 여야 한다.**
 *
 * Sentry 는 http·express·prisma 같은 모듈을 monkey-patch 해서 요청/쿼리를 추적한다. 그 모듈들이
 * Sentry.init 보다 먼저 require 되면 패치할 대상이 이미 다른 곳에 붙잡혀 있어 **조용히 아무것도
 * 계측되지 않는다**(에러가 나지 않아 더 위험하다). 그래서 이 파일만 따로 두고 맨 위에서 부른다.
 *
 * DSN 은 `apps-admin-api.sentry.dsn` 이다 — **hansapp-api 와 다른 키를 본다.** 관리자 API 의
 * 오류는 공개 API 이슈 스트림과 섞이면 묻힌다(호출량이 두 자릿수 이상 차이난다).
 * 비어 있으면 init 자체를 하지 않는다 — 이후 captureException 등은 전부 no-op 이 된다.
 */
const enabled = appConfig.getBoolOrDefault('apps-admin-api.sentry.enabled');
const dsn = enabled ? appConfig.getStringOrDefault('apps-admin-api.sentry.dsn') : '';
const tracesSampleRate = appConfig.getNumberOrDefault('apps-admin-api.sentry.tracesSampleRate');

if (dsn) {
  Sentry.init({
    dsn,
    environment: appConfig.env,
    release: buildInfo.tagVersion,
    tracesSampleRate,
    initialScope: {
      tags: { sha: buildInfo.sha, branch: buildInfo.branch },
    },
  });
}

/**
 * Sentry 가 **실제로 켜졌는지.** enabled 플래그가 아니라 `init` 이 돌았는지(=DSN 이 있는지)다 —
 * 켠다고 해 두고 DSN 이 비어 있으면 아무것도 안 나가므로, 그 구분을 부르는 쪽이 알아야 한다.
 *
 * 부팅 실패 보고(reportBootFailure)가 이 값으로 "기다릴지 말지" 를 정한다.
 */
export const sentryEnabled = Boolean(dsn);

/**
 * 부팅 로그 한 줄. main.ts 가 설정 요약과 같이 찍는다 —
 * "Sentry 가 켜졌는지" 를 로그만 보고 알 수 있어야 한다(조용히 꺼져 있는 게 최악이다).
 */
export const sentryStatusLine = dsn
  ? `🛰  Sentry : ${appConfig.env} / ${buildInfo.tagVersion} (traces ${tracesSampleRate})`
  : enabled
    ? '🛰  Sentry : disabled — apps-admin-api.sentry.dsn is not set'
    : '🛰  Sentry : disabled — SENTRY_ENABLED=false';
