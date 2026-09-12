import { useEffect } from 'react';
import * as Sentry from '@sentry/react';
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from 'react-router-dom';

// 환경 이름·산출물 신원은 푸터도 같은 값을 보여 준다. 두 곳에서 따로 읽으면 언젠가 갈린다.
import { APP_ENV, APP_RELEASE } from '@/shared/config/env';

/**
 * 에러 추적(Sentry). **import 되는 순간 초기화된다.**
 *
 * 다른 앱(포털웹·인증웹)처럼 `initSentry()` 를 main 에서 부르지 않는 이유가 있다. 이 앱은 라우터를
 * **App.tsx 의 모듈 최상위**에서 만든다(createBrowserRouter). import 는 문(statement)보다 먼저
 * 평가되므로, main.tsx 본문에서 init 을 부르면 라우터가 이미 만들어진 뒤다. 그래서 부수효과
 * 모듈로 두고 main.tsx 의 **첫 import** 로 올린다(백엔드 instrument.ts 와 같은 이유·같은 이름).
 *
 * DSN 은 VITE_SENTRY_DSN 으로 주입한다. 비밀이 아니다 — 이벤트 전송 전용 공개 엔드포인트라
 * 어차피 번들에 구워진다. 없으면(로컬 기본) init 을 아예 하지 않는다: 이후 captureException
 * 등이 전부 no-op 이라 호출부를 분기할 필요가 없다.
 *
 * medifinder-web 은 자기 Sentry 프로젝트를 쓴다(포털웹·인증웹·docs 와 분리).
 * environment 로 local/develop/production 을, release 로 어느 산출물인지 가른다.
 */

const DSN = (import.meta.env.VITE_SENTRY_DSN as string | undefined) ?? '';
const TRACES_SAMPLE_RATE =
  Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE) || 0;

/** Sentry 가 설정돼 켜졌는지. */
export const sentryEnabled = Boolean(DSN);


/**
 * 좌표를 담은 쿼리 파라미터. **URL 어디에 있든 Sentry 로 나가기 전에 지운다.**
 *
 * 검색 요청이 `?lat=&lon=` 으로 나가는데, Sentry 는 fetch 스팬과 breadcrumb 에 **URL 을
 * 통째로** 싣는다. 운영은 트레이스를 10% 표집하므로 그대로 두면 그 비율만큼 좌표가 Sentry 에
 * 쌓인다 — 개인정보처리방침에 "검색 결과를 계산하는 데에만 쓰고 저장하지 않는다" 고 적어 둔
 * 것과 어긋난다.
 *
 * 1km 격자로 뭉갠 값이라 위험이 크지는 않지만, **적어 둔 것과 하는 일을 맞추는 쪽이** 낫다.
 * 지도 영역(bbox)도 결국 화면에 띄운 위치라 같이 지운다.
 */
const GEO_PARAMS = ['lat', 'lon', 'minLat', 'minLon', 'maxLat', 'maxLon'];

/**
 * URL 문자열에서 좌표 파라미터의 값을 지운다. URL 이 아니면 그대로 돌려준다.
 *
 * 값만 `redacted` 로 바꾸고 키는 남긴다(대괄호를 쓰면 퍼센트 인코딩돼 읽기 나쁘다) — 어떤 요청이었는지는 알아야 디버깅이 된다.
 * 상대 경로도 들어오므로 기준 origin 을 붙여 파싱하고, 원래 모양에 맞춰 돌려준다.
 */
function scrubGeo(value: string): string {
  if (!value.includes('=')) return value;
  try {
    const absolute = /^https?:\/\//.test(value);
    const url = new URL(value, absolute ? undefined : window.location.origin);
    let touched = false;
    for (const key of GEO_PARAMS) {
      if (url.searchParams.has(key)) {
        url.searchParams.set(key, 'redacted');
        touched = true;
      }
    }
    if (!touched) return value;
    return absolute ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
  } catch {
    // URL 로 못 읽는 문자열(스팬 설명이 "GET /x" 처럼 오는 경우 등)은 건드리지 않는다.
    return value;
  }
}

if (DSN) {
  Sentry.init({
    dsn: DSN,
    environment: APP_ENV,
    // `0.0.1-a1b2c3d`. 어느 빌드에서 난 에러인지 — 로컬 빌드면 sha 자리가 dev 다.
    release: APP_RELEASE,
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

    /*
      좌표가 실려 나가는 자리는 셋이다 — 트랜잭션의 스팬(fetch), breadcrumb, 그리고 오류
      이벤트의 request.url. 세 곳을 각각 막는다. 한 곳만 막으면 나머지로 그대로 나간다.
    */
    beforeSendTransaction(event) {
      for (const span of event.spans ?? []) {
        if (typeof span.description === 'string') {
          span.description = scrubGeo(span.description);
        }
        const url = span.data?.['http.url'];
        if (typeof url === 'string') {
          span.data['http.url'] = scrubGeo(url);
        }
      }
      return event;
    },
    beforeSend(event) {
      if (typeof event.request?.url === 'string') {
        event.request.url = scrubGeo(event.request.url);
      }
      return event;
    },
    beforeBreadcrumb(breadcrumb) {
      const url = breadcrumb.data?.url;
      if (typeof url === 'string') {
        breadcrumb.data!.url = scrubGeo(url);
      }
      return breadcrumb;
    },
  });
}
