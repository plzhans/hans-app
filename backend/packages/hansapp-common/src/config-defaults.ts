/**
 * 설정 기본값의 단일 원천. **경로 하나에 값 하나.**
 *
 * `getNumberOrDefault('cache.memoryTtlSec')` 처럼 인자를 안 넘기면 여기서 찾는다.
 * 그래서 같은 기본값이 여러 파일에 복제되지 않는다 — 실제로 `auth.cookieSecure` 는
 * 네 곳에 따로 적혀 있었다(auth.config · admin-auth.config · refresh-cookie · admin-cookie).
 *
 * ── 값을 정하는 기준 ──────────────────────────────────────────────────────────
 * **기본값은 언제나 운영 기준이다.** 다른 환경에서 느슨하게 갈 일이 있으면 그 환경의
 * yaml 이 명시로 낮춘다. 반대로 두면(개발 기준을 기본으로) 운영에서 한 줄 빠뜨렸을 때
 * 조용히 느슨해지고, 그건 배포하고 한참 뒤에나 안다.
 *
 * **예외는 "없는 것이 기본" 인 것들이다** — 있는 쪽이 바깥 무언가를 요구하는 설정.
 * 켤 환경이 자기 yaml 에 명시로 적고, 안 적으면 그냥 없다.
 *
 *   apps-*.web.sslCertificate*    인증서 파일이 있어야 켜진다. 없는 경로를 기본으로 깔면
 *                                 인증서를 안 쓰는 환경이 부팅에서 죽는다 (여기 없음)
 *   apps-*.proxy.trust            앞에 프록시가 없는데 켜면 위조 XFF 를 진짜 IP 로 믿는다 (여기 없음)
 *   apps-*.proxy.clientIpHeader   Cloudflare 뒤가 아닌데 켜면 아무나 헤더를 지어낸다 (여기 없음)
 *   apps-*.sentry.enabled         DSN 이 붙은 프로젝트로 이벤트가 나간다 — 켠 환경만 보낸다
 *   apps-*.swagger.enabled        문서는 공개면이다. 열 이유가 있는 환경만 연다
 *
 * ── 여기 없는 것 ──────────────────────────────────────────────────────────────
 * 환경마다 달라야 해서 기본값이 있을 수 없는 값(issuer·externalUrl·rootDomain),
 * 그리고 비밀값. 그런 것은 yaml 이 선언만 하고 값은 환경 파일·env 가 준다.
 */
export const CONFIG_DEFAULTS = {
  // ── API 접근 캐시 ───────────────────────────────────────────────────────────
  'cache.memoryMaxEntries': 10_000,
  'cache.memoryTtlSec': 300, // 5분
  'cache.sharedTtlSec': 600, // 10분

  // ── 인증 ────────────────────────────────────────────────────────────────────
  // 운영은 HTTPS 다. http 로 뜨는 환경만 자기 yaml 에서 끈다.
  'auth.cookieSecure': true,
  'auth.socialFlowTtlSec': 600,
  'auth.bcryptRounds': 10,
  'auth.withdrawalRetentionDays': 30,
  'auth.maxSessionsPerUser': 10,
  /*
    로그인 세션 캐시. **API 접근 캐시(cache.*)와 따로 둔다** — 그쪽은 서비스 키·클라이언트라
    몇 분 늦어도 그만이지만, 이쪽은 관리자가 세션을 끊었을 때 반영이 늦는 시간이다.
    두 단(메모리·Redis)을 같은 값으로 둬서, 이벤트가 유실돼도 지연이 이 값을 넘지 않는다.
  */
  'auth.sessionCache.memoryTtlSec': 60,
  'auth.sessionCache.sharedTtlSec': 60,
  /*
    `/users/me` 응답 캐시. **공개 API 라 호출 빈도를 우리가 정하지 못한다** — 연동한 앱이
    요청마다 부를 수도 있어서, 매번 DB 를 묻지 않으려고 두는 캐시다.

    **두 단의 값이 다른 이유가 있다.**

    Redis 는 길게(10분) 잡는다. 값이 바뀌는 경로가 전부 이 키를 직접 지우므로, TTL 이
    실제로 쓰이는 때는 그중 하나를 빠뜨렸을 때뿐이다 — 정상 동작의 신선도가 아니라
    "코드가 틀렸을 때 얼마나 빨리 낫나" 다. 짧게 잡으면 아끼려던 DB 조회를 그 주기로
    도로 하게 된다.

    메모리는 짧게(1분) 잡는다. 이쪽은 사정이 다르다 — 다른 서비스(관리자 콘솔)가 고쳤을 때
    각 인스턴스가 자기 메모리를 비우는 통로가 이벤트인데, 지금 전달이 작업 큐라 한 대만
    받는다. 나머지가 옛 값을 내는 시간이 이 값이다. 소비를 컨슈머 그룹으로 바꾸면 이
    제약이 사라지고, 그때는 이 값도 늘릴 수 있다.
  */
  'auth.profileCache.memoryTtlSec': 60,
  'auth.profileCache.sharedTtlSec': 600,
  'auth.jwt.accessTokenExpiresIn': '1h',
  'auth.jwt.refreshTokenExpiresIn': '7d',
  'auth.jwt.authCodeExpiresIn': '5m',
  'auth.otp.codeLength': 6,
  'auth.otp.ttlSec': 600,
  'auth.otp.maxAttempts': 5,
  'auth.otp.resendCooldownSec': 60,
  'auth.otp.maxSendsPerHour': 5,
  // 약관·방침의 현재 판(시행일). frontend/legal 의 JSON `version` 과 같아야 한다.
  'auth.consent.termsVersion': '2026-08-06',
  'auth.consent.privacyVersion': '2026-08-06',

  // ── 관리자 인증 ─────────────────────────────────────────────────────────────
  'admin.bcryptRounds': 10,
  'admin.jwt.accessTokenExpiresIn': '5m',
  'admin.jwt.refreshTokenExpiresIn': '8h',
  'admin.maxSessionsPerAdmin': 5,
  // 첫 관리자 자동 생성. 켤 환경이 명시로 켠다(운영은 켜도 코드가 거부한다).
  'admin.bootstrap.enabled': false,
  'admin.bootstrap.name': '관리자',

  // ── 메일 ────────────────────────────────────────────────────────────────────
  // DB 설정을 무시하고 발송을 막는 스위치. 운영은 당연히 막지 않는다.
  'mail.forceDisabled': false,

  // ── hansapp-api ─────────────────────────────────────────────────────────────
  'apps-api.name': 'HansApp',
  'apps-api.web.port': 3000,
  // 문서를 열려면 그 환경이 명시로 켠다.
  'apps-api.swagger.enabled': false,
  // 켠 뒤의 기본은 **잠근 쪽**이다 — 등록된 IP 만 본다(목록이 비면 아무도 못 본다).
  // 개발에서 목록을 채워야 열리면 불편하기만 해서, 그런 환경이 명시로 푼다.
  'apps-api.swagger.ipRestricted': true,
  'apps-api.sentry.enabled': false,
  // 켠 뒤의 기본은 운영 기준 10%. 트래픽이 적은 환경이 자기 yaml 에서 올린다.
  'apps-api.sentry.tracesSampleRate': 0.1,

  // ── hansapp-admin-api ───────────────────────────────────────────────────────
  'apps-admin-api.name': 'hansapp-admin-api',
  'apps-admin-api.web.port': 3001,
  // 관리자 SPA 정적파일. 이미지가 여기 굽고, 비우면 SPA 를 안 내보낸다(로컬은 Vite).
  'apps-admin-api.web.staticDir': '',
  'apps-admin-api.swagger.enabled': false,
  'apps-admin-api.sentry.enabled': false,
  'apps-admin-api.sentry.tracesSampleRate': 0.1,

  // ── hansapp-batch ───────────────────────────────────────────────────────────
  'apps-batch.name': 'hansapp-batch',
  'apps-batch.cron': '0 4 * * *',
  'apps-batch.maxCallsPerRun': 0, // 0 = 무제한
  'apps-batch.sentry.enabled': false,
  // 배치는 요청 트레이스가 없다. 크론 실행 트레이스가 필요해지면 그 환경에서 올린다.
  'apps-batch.sentry.tracesSampleRate': 0,

  // ── 검색 ────────────────────────────────────────────────────────────────────
  'search.batchSize': 1000,

  // ── 외부 API ────────────────────────────────────────────────────────────────
  'krdata.maxRetry': 3,
  'krdata.readTimeoutMs': 60_000,
  'juso.maxRetry': 3,
  'juso.readTimeoutMs': 30_000,

  // ── 이벤트 큐 ───────────────────────────────────────────────────────────────
  'events.concurrency': 5,

  // ── LLM ─────────────────────────────────────────────────────────────────────
  'llm.promptDir': 'data/healthcare/svc-prompts',
} as const;

/** 표에 담기는 값. yaml 이 낼 수 있는 끝값과 같은 갈래다. */
export type ConfigDefaultValue = string | number | boolean;

/** 설정 경로 → 기본값. 등록되지 않은 경로면 undefined. */
export function configDefaultOf(path: string): ConfigDefaultValue | undefined {
  return (CONFIG_DEFAULTS as Record<string, ConfigDefaultValue | undefined>)[
    path
  ];
}
