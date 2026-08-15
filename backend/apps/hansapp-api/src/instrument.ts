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
 * DSN 은 config/config.yaml 의 `apps-api.sentry.dsn` 이다(비밀 아님 — 전송 전용 공개값).
 * **비어 있으면 init 자체를 하지 않는다** — 이후 captureException 등은 전부 no-op 이 된다.
 */

/**
 * **끄개는 dsn 과 따로 둔다.** dsn 은 yaml 에 리터럴로 박혀 있고(비밀이 아니라서),
 * `${VAR:-기본값}` 은 빈 값을 주면 기본값으로 되돌아간다 — 그래서 env 로 dsn 을 비워서 끌 수가
 * 없다. 개인 오버라이드(config/.env.develop.local)로 SENTRY_ENABLED=false 를 주면 여기서 끊긴다.
 *
 * 내 머신에서 develop 으로 띄울 때 내 에러가 팀 이슈 스트림에 섞이지 않게 하려는 것이다.
 */
const enabled = appConfig.getBoolOrDefault('apps-api.sentry.enabled');
const dsn = enabled ? appConfig.getStringOrDefault('apps-api.sentry.dsn') : '';
const tracesSampleRate = appConfig.getNumberOrDefault('apps-api.sentry.tracesSampleRate');

if (dsn) {
  Sentry.init({
    dsn,
    // 이벤트를 환경별로 가른다. 프로젝트 하나에 local/develop/production 이 같이 들어와도 섞이지 않는다.
    environment: appConfig.env,
    // 이 이벤트가 "어느 산출물" 에서 났는지. tagVersion 은 0.0.1-a1b2c3d 형태(+ 를 안 쓰는 자리용)라
    // docker 태그와 같은 문자열이다. 나중에 소스맵을 올린다면 sentry-cli 의 --release 도 이 값이어야 한다.
    release: buildInfo.tagVersion,
    // 성능 트레이스 표본 비율(yaml). 개발 1.0 / 운영 0.1.
    tracesSampleRate,
    // 숫자 버전만으로는 어느 커밋인지 모른다. 커밋·브랜치를 모든 이벤트에 붙인다.
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
    ? '🛰  Sentry : disabled — apps-api.sentry.dsn is not set'
    : '🛰  Sentry : disabled — SENTRY_ENABLED=false';
