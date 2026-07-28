import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';
import { loadSpec, specPath } from './openapi-spec';

/**
 * 실행 환경 이름(local|develop|production). Sentry 의 environment 태그가 이 값이다.
 *
 * **.env.<환경> 으로는 못 가른다.** docs 는 dotenv-cli 없이 `vitepress build` 를 그냥 돌려서
 * vite 의 mode 가 develop/production 둘 다 'production' 이다(→ .env.develop 은 로드되지 않는다).
 * 그래서 배포 스크립트(scripts/ci/build-frontend.sh)가 DOCS_BASE 와 같이 DOCS_ENV 를 넘겨준다.
 */
const docsEnv = process.env.DOCS_ENV ?? 'local';

/**
 * Sentry release 로 쓸 산출물 신원. 숫자 버전만으로는 어느 커밋인지 모른다.
 * sha 는 CI 가 넣어 준다(GitHub Actions 는 GITHUB_SHA). 로컬 빌드면 'dev' 가 박힌다.
 */
const pkg = JSON.parse(
  readFileSync(resolve(__dirname, '../package.json'), 'utf-8'),
) as { version: string };
const gitSha = (process.env.VITE_GIT_SHA ?? process.env.GITHUB_SHA ?? 'dev')
  .trim()
  .slice(0, 7);

/**
 * Sentry DSN. **비밀이 아니라 여기 리터럴로 박는다** — 이벤트 전송 전용 공개 엔드포인트라
 * 어차피 클라이언트 번들에 구워지고, 이걸로는 아무것도 읽지 못한다.
 *
 * **.env.production 에 두면 안 된다.** 그 파일은 gitignore 대상이라(운영 GA ID 등을 로컬 보관하는
 * 정책) CI 체크아웃에 존재하지 않는다 → 배포 빌드에서 DSN 이 비어 Sentry 가 조용히 꺼진다.
 * 커밋되는 이 파일이 유일하게 안전한 자리다. SENTRY_DSN 환경변수로 덮을 수 있다.
 *
 * 로컬(`pnpm docs:dev`)에서는 DOCS_ENV 가 없어 __APP_ENV__ 가 'local' 이 되고, theme/sentry.ts 가
 * 그때는 init 을 건너뛴다 — 내 머신 에러가 팀 이슈 스트림에 섞이지 않게.
 */
const sentryDsn =
  process.env.SENTRY_DSN ??
  'https://8bf492fdc72550de57042146713faab5@o4507886343159808.ingest.de.sentry.io/4511811442507856';

// 스펙을 빌드 시 파일에서 읽는다. 경로는 OPENAPI_SPEC 환경변수로 오버라이드 가능하다.
const spec = loadSpec();
// 빌드 로그에 실제 사용한 스펙 경로를 남긴다(CI 디버깅용).
console.log(`[hansapp-docs] OpenAPI spec: ${specPath}`);

const HTTP_VERBS = [
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'options',
  'head',
  'trace',
];

// 스펙을 태그별 오퍼레이션으로 수집한다(정의 순서 유지).
// 한 태그 = 한 페이지(/apis/:tag), 오퍼레이션은 그 페이지 내 앵커(#op-:operationId).
function collectTags(): Map<string, Array<{ operationId: string; summary: string }>> {
  const byTag = new Map<string, Array<{ operationId: string; summary: string }>>();
  for (const item of Object.values<any>(spec.paths ?? {})) {
    for (const verb of HTTP_VERBS) {
      const op = item?.[verb];
      if (!op) continue;
      const tag = (op.tags && op.tags[0]) || 'default';
      if (!byTag.has(tag)) byTag.set(tag, []);
      byTag.get(tag)!.push({
        operationId: op.operationId,
        summary: op.summary || op.operationId,
      });
    }
  }
  return byTag;
}

const byTag = collectTags();
const allTags = [...byTag.keys()];
// '정부데이터 원본' 그룹에 매핑할 태그(명시적 화이트리스트).
const ORIGIN_TAGS = ['hira', 'nmc'];
// '헬스케어' 그룹에 매핑할 태그. origin(hira/nmc)을 통합한 상위 API 이므로
// 정부데이터 원본과 분리해 별도 상위 그룹으로 노출한다.
//
// **태그를 여기 안 적으면 조용히 '기타' 로 떨어진다.** 화이트리스트라 그렇다.
// 서버에 @ApiTags 를 새로 추가했다면 이 표에도 적어야 한다. 순서가 사이드바 순서다.
const HEALTHCARE_TAG_LABELS: Record<string, string> = {
  // 그룹 제목은 하위 오퍼레이션과 겹치지 않게 짧게 둔다.
  // '병원 검색' 으로 두면 헬스케어 > 병원 검색 > 병원 검색 이 되어 같은 말이 두 번 나온다.
  healthcare: '병원',
  'healthcare-meta': '참조 데이터',
};
const HEALTHCARE_TAGS = Object.keys(HEALTHCARE_TAG_LABELS);
// 최상위 참조 데이터. **도메인 무관이라 헬스케어 밑에 두지 않는다** —
// 지하철역도 지역 코드도 병원만 쓰는 게 아니다. 병원·학교·약국이 같이 쓴다.
const TRANSPORT_TAGS = ['transport'];
// 주소(address) 그룹. 지역 코드와 영문 주소 번역을 하나의 address 태그로 통일했다(둘 다 /address/*).
const ADDRESS_TAGS = ['address'];
// 국세청 API. 상위 그룹은 '국세청', 하위 태그(business)는 '사업자'로 라벨한다.
// 헬스케어와 같은 2단 구조다(그룹 > 태그 > 오퍼레이션). 태그가 늘면 여기에 적는다.
const BUSINESS_TAG_LABELS: Record<string, string> = {
  business: '사업자',
};
const BUSINESS_TAGS = Object.keys(BUSINESS_TAG_LABELS);
const originTags = allTags.filter((t) => ORIGIN_TAGS.includes(t));
// 스펙에 실제로 있는 태그만, HEALTHCARE_TAG_LABELS 에 적은 순서대로 노출한다.
const healthcareTags = HEALTHCARE_TAGS.filter((t) => allTags.includes(t));
const transportTags = allTags.filter((t) => TRANSPORT_TAGS.includes(t));
const addressTags = allTags.filter((t) => ADDRESS_TAGS.includes(t));
// 스펙에 실제로 있는 태그만, BUSINESS_TAG_LABELS 에 적은 순서대로.
const businessTags = BUSINESS_TAGS.filter((t) => allTags.includes(t));
// 어느 그룹에도 매핑되지 않은 나머지 태그는 모두 '기타'로 간다.
const etcTags = allTags.filter(
  (t) =>
    !ORIGIN_TAGS.includes(t) &&
    !HEALTHCARE_TAGS.includes(t) &&
    !TRANSPORT_TAGS.includes(t) &&
    !ADDRESS_TAGS.includes(t) &&
    !BUSINESS_TAGS.includes(t),
);
// 상단 nav 의 'API' 가 착지하는 곳. **주력 API(헬스케어 병원 검색)여야 한다.**
// 예전엔 originTags[0](=hira)로 가서, 문서를 처음 여는 사람이 정부데이터 원본부터 만났다.
// 원본은 대부분 쓸 일이 없는데도 제일 먼저 보이니 그게 주력인 줄 알게 된다.
const landingTag = healthcareTags[0] ?? allTags[0];

// 오퍼레이션 → 사이드바 앵커 항목(태그 페이지 안의 #op-:operationId 로 점프)
function opItems(tag: string) {
  return (byTag.get(tag) ?? []).map((op) => ({
    text: op.summary,
    link: `/apis/${tag}#op-${op.operationId}`,
  }));
}
// 태그 → 사이드바 그룹(그룹 제목은 태그 페이지로 링크)
// label 을 주면 그룹 제목을 태그명 대신 표시명으로 바꾼다(예: healthcare → '병원 검색').
function tagGroup(tag: string, label?: string) {
  return {
    text: label ?? tag,
    link: `/apis/${tag}`,
    collapsed: false,
    items: opItems(tag),
  };
}

// withMermaid 로 감싸 ```mermaid 코드펜스를 다이어그램으로 렌더한다(시퀀스·플로우 등).
export default withMermaid(defineConfig({
  title: 'Hans API',
  description: 'Hans API 명세 문서',
  lang: 'ko-KR',
  // apis/notes/*.md 는 개별 페이지가 아니라 태그 페이지에 주입되는 조각이므로 라우팅에서 제외한다.
  srcExclude: ['apis/notes/**'],
  // 다크/라이트 토글은 유지하되(appearance: true) 기본값은 라이트로 강제한다.
  // 저장된 사용자 선택이 없을 때 'light' 를 시드해 OS 가 다크여도 라이트로 시작하게 한다.
  appearance: true,
  head: [
    [
      'script',
      {},
      "try{if(!localStorage.getItem('vitepress-theme-appearance')){localStorage.setItem('vitepress-theme-appearance','light')}}catch(e){}",
    ],
  ],
  // 완전 정적 사이트(vitepress build). base 는 배포 경로에 맞춰 조정한다.
  //
  // 하나의 Pages 사이트가 여러 환경을 담는다.
  //   production  →  /          (docs.plzhans.com)
  //   develop     →  /develop/  (docs.plzhans.com/develop/)
  //
  // base 가 틀리면 페이지는 뜨는데 CSS·JS 경로가 어긋나 화면이 깨진다.
  // 그래서 배포 경로를 아는 쪽(scripts/ci/build-frontend.sh)이 넘겨준다.
  base: process.env.DOCS_BASE ?? '/',
  themeConfig: {
    nav: [
      { text: '소개', link: '/' },
      { text: '공통', link: '/common' },
      { text: 'API', link: `/apis/${landingTag}` },
    ],
    sidebar: [
      {
        text: '시작하기',
        items: [{ text: '소개', link: '/' }],
      },
      {
        // 공통: 모든 API 에 똑같이 적용되는 규칙(인증·다국어)을 **한 페이지**에 모은다.
        //
        // 페이지를 쪼개지 않는 이유: 인증과 다국어는 요청 하나에 **같이** 필요하다.
        // 페이지가 둘이면 읽다 말고 클릭해서 옮겨 다녀야 한다. 사이드바 항목은 페이지 링크가
        // 아니라 같은 페이지 안의 **섹션 앵커**다 — 눌러도 스크롤만 되고 페이지는 안 바뀐다.
        text: '공통',
        link: '/common',
        collapsed: false,
        items: [
          { text: '인증', link: '/common#인증' },
          { text: '로그인 연동(OAuth·PKCE)', link: '/common#login-integration' },
          { text: '토큰 만료', link: '/common#token-ttl' },
          { text: 'JWT 검증(JWKS)', link: '/common#jwt-verify' },
          { text: '다국어', link: '/common#다국어' },
        ],
      },
      // 헬스케어: 통합 API. 태그마다 한 그룹이고, 하위는 오퍼레이션 앵커다.
      //   병원        healthcare       병원 검색·상세
      //   참조 데이터 healthcare-meta  진료과목·종별·장비 등 검색 조건용 코드
      // 교통정보·지역 코드는 여기 없다 — 도메인 무관이라 최상위 그룹으로 뺐다.
      ...(healthcareTags.length
        ? [
            {
              text: '헬스케어',
              collapsed: false,
              // **3뎁스(오퍼레이션 앵커)는 노출하지 않는다** — 태그를 링크로만 둔다.
              items: healthcareTags.map((t) => ({
                text: HEALTHCARE_TAG_LABELS[t],
                link: `/apis/${t}`,
              })),
            },
          ]
        : []),
      // 교통정보·주소: 도메인 무관 참조 데이터. 태그 층 없이 오퍼레이션을 바로 나열한다.
      // (태그가 단일 오퍼레이션이면 태그 그룹을 두는 순간 '주소 > 지역 코드 > 지역 코드' 처럼 겹친다)
      ...(transportTags.length
        ? [
            {
              text: '교통정보',
              collapsed: false,
              items: transportTags.flatMap(opItems),
            },
          ]
        : []),
      // 주소: 지역 코드와 영문 주소 번역(둘 다 address 태그, /address/*)을 한 그룹에 오퍼레이션으로 나열한다.
      ...(addressTags.length
        ? [
            {
              text: '주소',
              collapsed: false,
              items: addressTags.flatMap(opItems),
            },
          ]
        : []),
      // 국세청: 상위 그룹 아래 태그(사업자)를 링크로만 둔다.
      // **3뎁스(오퍼레이션 앵커)는 노출하지 않는다** — 태그 페이지로만 들어가게 한다.
      ...(businessTags.length
        ? [
            {
              text: '국세청',
              collapsed: false,
              items: businessTags.map((t) => ({
                text: BUSINESS_TAG_LABELS[t],
                link: `/apis/${t}`,
              })),
            },
          ]
        : []),
      {
        // 정부데이터 원본: 매핑된 태그(hira/nmc)마다 한 페이지, 하위는 오퍼레이션 앵커.
        //
        // **기본으로 접어 둔다.** 캐싱한 원본이라 대부분의 사용자가 볼 일이 없는데,
        // 오퍼레이션이 11개라 펼쳐 두면 사이드바를 통째로 차지해 위쪽(헬스케어)을 밀어낸다.
        text: '정부데이터 원본',
        collapsed: true,
        items: originTags.map((t) => tagGroup(t)),
      },
      // 기타: 태그 층 없이 오퍼레이션(헬스 체크 등)을 바로 나열(앵커 링크).
      ...(etcTags.length
        ? [
            {
              text: '기타',
              collapsed: false,
              items: etcTags.flatMap(opItems),
            },
          ]
        : []),
    ],
    socialLinks: [],
  },
  vite: {
    define: {
      // 스펙을 정적 import 대신 빌드시 클라이언트/SSR 번들에 주입한다.
      __OPENAPI_SPEC__: JSON.stringify(spec),
      // Sentry 가 쓰는 값. 환경 이름은 DOCS_ENV(배포 스크립트), release 는 버전+커밋,
      // DSN 은 비밀이 아니라 리터럴(위 주석 — .env.production 은 커밋되지 않아 CI 에서 빈다).
      __APP_ENV__: JSON.stringify(docsEnv),
      __APP_RELEASE__: JSON.stringify(`${pkg.version}-${gitSha}`),
      __SENTRY_DSN__: JSON.stringify(sentryDsn),
    },
    // mermaid 최적화(dayjs·cytoscape 등 하위 의존 pre-bundle)는 withMermaid 플러그인이
    // optimizeDeps.include 로 이미 넣는다. pnpm 에서 그 베어 이름들이 resolve 되도록
    // 하위 의존을 root 로 hoist 하는 설정은 .npmrc(public-hoist-pattern)에 있다.
    // 포트를 지정(--port)하지 않으면 8801 을 기본으로 쓴다.
    server: { port: 8801 },
    preview: { port: 8801 },
  },
}));
