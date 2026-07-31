import type { App } from 'vue';
import * as Sentry from '@sentry/vue';

/**
 * 에러 추적(Sentry).
 *
 * DSN 은 **.vitepress/config.ts 에 리터럴로** 있다(→ __SENTRY_DSN__). 비밀이 아니다 — 이벤트
 * 전송 전용 공개 엔드포인트라 어차피 번들에 구워진다. .env.production 에 두지 않는 이유는
 * 그 파일이 gitignore 대상이라 CI 체크아웃에 없기 때문이다(배포 빌드에서 조용히 꺼진다).
 *
 * **로컬(`pnpm docs:dev`)에서는 끈다** — DOCS_ENV 가 없어 환경이 'local' 로 잡히면 init 을
 * 건너뛴다. 내 머신 에러가 팀 이슈 스트림에 섞이면 안 된다.
 *
 * hansapp-docs 는 자기 Sentry 프로젝트를 쓴다(포털웹·인증웹·medifinder 와 분리).
 * VitePress 는 Vue 3 앱이라 @sentry/react 가 아니라 @sentry/vue 다 — 컴포넌트 렌더 에러를
 * 잡으려면 Vue 앱 인스턴스를 넘겨야 해서 enhanceApp 에서 부른다.
 */

/** vite define 이 빌드 때 상수로 치환한다(→ .vitepress/config.ts). */
declare const __APP_ENV__: string;
declare const __APP_RELEASE__: string;
declare const __SENTRY_DSN__: string;

// 로컬 개발(DOCS_ENV 없음 → 'local')에서는 DSN 이 있어도 켜지 않는다.
const DSN = __APP_ENV__ === 'local' ? '' : __SENTRY_DSN__;

/**
 * 성능 트레이스 표본 비율. **문서 사이트는 0(끔)이 기본이다** —
 * 정적 페이지라 볼 것도 없고, 방문자 수만큼 트랜잭션을 태워 쿼터를 먹을 이유가 없다.
 * 에러만 받는다. 필요해지면 여기만 올린다.
 */
const TRACES_SAMPLE_RATE = 0;

/** Sentry 가 설정돼 켜졌는지. */
export const sentryEnabled = Boolean(DSN);

/**
 * enhanceApp 에서 1회 호출. **브라우저에서만 부른다** —
 * vitepress build 는 페이지를 Node 에서 렌더(SSG)하는데, 빌드 과정의 예외까지 Sentry 로
 * 올릴 이유가 없다(그건 CI 로그에서 볼 일이다).
 */
export function initSentry(app: App) {
  if (!DSN) return;

  Sentry.init({
    app,
    dsn: DSN,
    // 이벤트를 환경별로 가른다. DOCS_ENV(배포 스크립트)에서 온다 — .env 로는 못 가른다.
    environment: __APP_ENV__,
    // `0.0.1-a1b2c3d`. 어느 빌드에서 난 에러인지 — 로컬 빌드면 sha 자리가 dev 다.
    release: __APP_RELEASE__,
    tracesSampleRate: TRACES_SAMPLE_RATE,
  });
}
