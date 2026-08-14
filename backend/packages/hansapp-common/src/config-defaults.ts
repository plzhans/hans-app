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
    로그인 세션 캐시. 가드가 요청마다 보는 자리다.

    **여기 값은 상한이다.** 실제 수명은 그 요청이 들고 온 access token 의 남은 시간에서
    나온다 — 토큰의 만료는 발급 때 정해져 바뀌지 않고, 그 뒤에는 갱신을 거치며 어차피
    DB 를 보기 때문이다. 둘 중 짧은 쪽이 쓰인다.

    Redis 상한을 access token 수명(1시간)에 맞춘 이유가 그것이다. 폐기 경로가 이 키를
    직접 지우므로 상한이 실제로 쓰이는 때는 그중 하나를 놓쳤을 때뿐이다.

    메모리 상한만 짧게 남긴다. 다른 서비스(관리자 콘솔)가 끊었을 때 각 인스턴스가 자기
    메모리를 비우는 통로가 이벤트인데, 지금 전달이 작업 큐라 한 대만 받는다 — 나머지가
    옛 판단을 들고 있는 시간이 이 값이다. 컨슈머 그룹으로 바꾸면 이 제약이 사라진다.
  */
  'auth.sessionCache.memoryTtlSec': 60,
  'auth.sessionCache.sharedTtlSec': 3600,
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
  // API 이용약관. 가입이 아니라 앱 등록에서 받는다.
  'auth.consent.apiTermsVersion': '2026-08-14',

  // ── 관리자 인증 ─────────────────────────────────────────────────────────────
  'admin.bcryptRounds': 10,
  /*
    관리자 access token. **1시간이다.**

    한동안 5분이었다. stateless 토큰이라 발급 뒤 폐기가 안 되니, 계정을 막아야 할 때
    버티는 시간을 그 값으로 묶어 둔 것이었다. 지금은 가드가 요청마다 세션 캐시를 보고
    폐기를 잡아내므로(admin.sessionCache.ttlSec) 그 근거가 없어졌다 — 끊기·비활성화·계정
    삭제는 전부 세션과 그 캐시 칸을 함께 지우므로, 반영은 이 값과 무관하게 곧바로다.

    남는 것은 비밀번호 변경 강제(`chg`)뿐이다. 그 플래그만 토큰 클레임이라, 초기화하면서
    세션을 남겨 두면 최대 이만큼 뒤에 변경 화면으로 밀린다.
  */
  'admin.jwt.accessTokenExpiresIn': '1h',
  'admin.jwt.refreshTokenExpiresIn': '8h',
  'admin.maxSessionsPerAdmin': 5,
  /*
    관리자 세션 캐시. 가드가 요청마다 보는 자리다.

    **여기 값은 상한이고, 실제 수명은 그 요청이 들고 온 access token 의 남은 시간에서
    나온다** — 둘 중 짧은 쪽이 쓰인다. 토큰의 만료는 발급 때 정해져 바뀌지 않고, 그 시각이
    지나면 갱신을 거치며 어차피 DB 를 다시 보기 때문이다.

    그래서 상한을 access token 수명(1시간)에 맞춘다. 회원 세션 캐시(auth.sessionCache)와
    같은 규칙이다 — 짧게 잡으면 아끼려던 DB 조회를 그 주기로 도로 하게 되고, 콘솔 화면에는
    토큰과 무관한 시계가 하나 더 생겨 "1분 뒤에 뭔가 끊기나" 로 읽힌다.

    폐기 경로가 이 키를 직접 지우므로 상한이 실제로 쓰이는 때는 그 삭제를 놓쳤을 때뿐이고,
    그때는 콘솔의 캐시 화면에 남은 칸으로 드러난다.
  */
  'admin.sessionCache.ttlSec': 3600,
  /*
    관리자 내 정보(`/api/admins/me`) 응답 캐시.

    **세션 캐시와 성격이 다르다.** 그쪽은 가드의 판단이라 틀리면 막히거나 열리지만, 이쪽은
    화면에 뿌리는 값이라 틀리면 옛 값이 보인다 — 그래서 이 값은 "무효화를 빠뜨렸을 때
    얼마나 빨리 낫나" 다. 값이 바뀌는 경로는 전부 이 키를 직접 지운다(AdminProfileCache 주석).

    회원 쪽(auth.profileCache.sharedTtlSec)과 같은 10분이다.
  */
  'admin.profileCache.ttlSec': 600,
  // 첫 관리자 자동 생성. 켤 환경이 명시로 켠다(운영은 켜도 코드가 거부한다).
  'admin.bootstrap.enabled': false,
  'admin.bootstrap.name': '관리자',

  // ── 메일 ────────────────────────────────────────────────────────────────────
  // DB 설정을 무시하고 발송을 막는 스위치. 운영은 당연히 막지 않는다.
  'mail.forceDisabled': false,

  // ── hansapp-api ─────────────────────────────────────────────────────────────
  'apps-api.name': 'HansApp',
  'apps-api.web.port': 3000,
  // 문서를 열려면 그 환경이 명시로 켠다. 켜면 잠금이 없으므로 운영은 켜지 않는다.
  'apps-api.swagger.enabled': false,
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
  return (CONFIG_DEFAULTS as Record<string, ConfigDefaultValue | undefined>)[path];
}
