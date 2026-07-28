import { useEffect } from 'react';
import * as Sentry from '@sentry/react';
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from 'react-router-dom';

/**
 * 에러 추적(Sentry). **import 되는 순간 초기화된다.**
 *
 * 다른 앱(콘솔·포털)처럼 `initSentry()` 를 main 에서 부르지 않는 이유가 있다. 이 앱은 라우터를
 * **App.tsx 의 모듈 최상위**에서 만든다(createBrowserRouter). import 는 문(statement)보다 먼저
 * 평가되므로, main.tsx 본문에서 init 을 부르면 라우터가 이미 만들어진 뒤다. 그래서 부수효과
 * 모듈로 두고 main.tsx 의 **첫 import** 로 올린다(백엔드 instrument.ts 와 같은 이유·같은 이름).
 *
 * DSN 은 VITE_SENTRY_DSN 으로 주입한다. 비밀이 아니다 — 이벤트 전송 전용 공개 엔드포인트라
 * 어차피 번들에 구워진다. 없으면(로컬 기본) init 을 아예 하지 않는다: 이후 captureException
 * 등이 전부 no-op 이라 호출부를 분기할 필요가 없다.
 *
 * medifinder-web 은 자기 Sentry 프로젝트를 쓴다(콘솔·포털·docs 와 분리).
 * environment 로 local/develop/production 을, release 로 어느 산출물인지 가른다.
 */

const DSN = (import.meta.env.VITE_SENTRY_DSN as string | undefined) ?? '';
const APP_ENV = (import.meta.env.VITE_APP_ENV as string | undefined) ?? 'local';
const TRACES_SAMPLE_RATE =
  Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE) || 0;

/** Sentry 가 설정돼 켜졌는지. */
export const sentryEnabled = Boolean(DSN);

if (DSN) {
  Sentry.init({
    dsn: DSN,
    environment: APP_ENV,
    // `0.0.1-a1b2c3d`. 어느 빌드에서 난 에러인지 — 로컬 빌드면 sha 자리가 dev 다.
    release: __APP_RELEASE__,
    // 라우터 계측. 트랜잭션을 실제 URL 이 아니라 라우트 패턴으로 묶는다
    // (`/en/hospital/123` 이 아니라 `/:lang/hospital/:id`). 안 붙이면 병원마다 트랜잭션이 쪼개진다.
    // 이 앱은 **데이터 라우터**(createBrowserRouter)라 훅을 넘기는 것만으로는 부족하다 —
    // App.tsx 에서 createBrowserRouter 를 wrapCreateBrowserRouterV7 로 감싸는 것과 한 쌍이다.
    integrations: [
      Sentry.reactRouterV7BrowserTracingIntegration({
        useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
    ],
    tracesSampleRate: TRACES_SAMPLE_RATE,
  });
}
