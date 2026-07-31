import { useEffect } from 'react';
import * as Sentry from '@sentry/react';
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from 'react-router-dom';

import {
  APP_ENV,
  APP_RELEASE,
  SENTRY_DSN,
  SENTRY_TRACES_SAMPLE_RATE,
} from '@/shared/config/env';

/**
 * 에러 추적(Sentry).
 *
 * DSN 은 **VITE_SENTRY_DSN** 으로 주입한다(.env.<환경>). 없으면(로컬 기본) init 을 아예 하지
 * 않는다 — 이후 captureException 등은 전부 no-op 이라 코드를 분기할 필요가 없다.
 * GA(gtag.ts)와 같은 규약이다: 값이 있을 때만 붙인다.
 *
 * hansapp-web 은 자기 Sentry 프로젝트를 쓴다(인증웹·medifinder·docs 와 각각 분리).
 * environment 로 local/develop/production 을 가르고, release 로 어느 산출물인지 가른다.
 */

/** Sentry 가 설정돼 켜졌는지. */
export const sentryEnabled = Boolean(SENTRY_DSN);

/** 앱 부팅 시 1회 호출. **다른 초기화보다 먼저** 불러야 그 뒤에 난 에러가 잡힌다. */
export function initSentry() {
  if (!SENTRY_DSN) return;

  Sentry.init({
    dsn: SENTRY_DSN,
    // 이벤트를 환경별로 가른다(한 프로젝트에 local/develop/production 이 같이 들어와도 안 섞인다).
    environment: APP_ENV,
    // `0.0.1-a1b2c3d`. 어느 빌드에서 난 에러인지 — 로컬 빌드면 sha 자리가 dev 다.
    release: APP_RELEASE,
    integrations: [
      // 라우터 계측. 이걸 안 붙이면 트랜잭션 이름이 실제 URL 이라 `/apps/1`, `/apps/2` 가
      // 전부 따로 집계된다. 라우트 패턴(`/apps/:id`)으로 묶으려면 라우터 훅을 넘겨야 한다.
      Sentry.reactRouterV7BrowserTracingIntegration({
        useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
    ],
    tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,
  });
}
