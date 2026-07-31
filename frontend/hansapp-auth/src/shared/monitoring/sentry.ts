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
 *
 * hansapp-auth(인증웹)는 자기 Sentry 프로젝트를 쓴다. **여기서 나는 에러는 곧 로그인 불가**라
 * 다른 앱 이슈에 섞이면 안 된다. environment 로 local/develop/production 을 가른다.
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
      // 라우터 계측. 트랜잭션을 실제 URL 이 아니라 라우트 패턴으로 묶는다.
      // 이 앱은 basename(/auth)을 쓰는데, 라우터 훅을 그대로 넘기므로 basename 도 반영된다.
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
