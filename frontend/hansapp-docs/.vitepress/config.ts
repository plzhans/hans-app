import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { defineConfig, type HeadConfig } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';
import { loadSpec, sortOperations, specPath } from './openapi-spec';

/**
 * 실행 환경 이름(local|develop|production). Sentry 의 environment 태그가 이 값이다.
 *
 * **.env.<환경> 으로는 못 가른다.** docs 는 dotenv-cli 없이 `vitepress build` 를 그냥 돌려서
 * vite 의 mode 가 develop/production 둘 다 'production' 이다(→ .env.develop 은 로드되지 않는다).
 * 그래서 배포 스크립트(scripts/ci/build-frontend.sh)가 DOCS_BASE 와 같이 DOCS_ENV 를 넘겨준다.
 */
const docsEnv = process.env.DOCS_ENV ?? 'local';

/**
 * 환경마다 달라지는 주소를 `.env.<환경>` 에서 읽는다.
 *
 * **표로 박지 않는 이유는 환경이 늘 때 이 파일을 고치게 되기 때문이다.** 주소를 아는 것은
 * 배포 설정이지 빌드 코드가 아니다. `.env.staging` 을 하나 추가하면 여기는 그대로 둔 채
 * 새 환경이 돈다. frontend/ci-build.sh 가 `set -a` 로 `.env.$APP_ENV` 를 통째로
 * process.env 에 실어 주므로 여기서 그냥 읽힌다.
 *
 * **VITE_ 접두를 붙이지 않는다.** 그 접두는 "브라우저 번들에 인라인해도 되는 값" 이라는
 * 표시인데, 이건 빌드가 canonical·sitemap 을 만들 때만 쓰는 값이다.
 */
function originFromEnv(name: string, localFallback: string): string {
  const value = process.env[name]?.trim();
  // 끝의 / 는 여기서 한 번만 떼어 둔다. 뒤에서 base 를 이어 붙이므로 겹치면 //docs/ 가 된다.
  if (value) return value.replace(/\/+$/, '');
  // 로컬 개발 서버(pnpm docs:dev)는 ci-build.sh 를 타지 않아 .env 가 없다.
  if (docsEnv === 'local') return localFallback;
  /*
    **배포 빌드에서 비면 여기서 죽인다.** 폴백으로 넘어가면 로컬 주소가 박힌 canonical 과
    sitemap 이 그대로 배포된다 — 빌드는 성공하고 화면도 멀쩡해서 아무도 모르는데,
    검색엔진에는 localhost 를 정본이라고 알린 셈이 된다.
  */
  throw new Error(
    `[hansapp-docs] ${name} 이 없다. frontend/hansapp-docs/.env.${docsEnv} 에 적을 것.`,
  );
}

/** 문서 자신의 도메인. 문서는 이 도메인의 /docs 밑에 산다(서브도메인을 두지 않는다). */
const docsOrigin = originFromEnv('DOCS_ORIGIN', 'http://localhost:8801');

/**
 * 포털 주소. 상단 nav 의 HOME 이 여기로 돌아간다.
 *
 * 배포 환경에서는 문서가 포털 도메인 밑이라 DOCS_ORIGIN 과 같은 값이지만 **따로 받는다** —
 * 로컬에서 이미 갈린다(문서 8801, 포털 5274). 하나로 묶으면 나중에 도로 쪼갤 때
 * 어느 쪽이 어느 뜻이었는지 알 수 없다.
 */
const portalOrigin = originFromEnv('PORTAL_ORIGIN', 'http://127.0.0.1:5274');

/**
 * 사이트가 놓이는 경로. 배포 경로를 아는 쪽(frontend/ci-build.sh)이 '/docs/' 로 넘겨준다.
 * 로컬 개발 서버는 안 넘기므로 루트로 뜬다.
 */
const docsBase = process.env.DOCS_BASE ?? '/';

/**
 * 산출물을 쌓을 자리. **base 에서 유도한다.**
 *
 * Workers 정적 자산은 nginx 의 alias 같은 접두사 제거가 없다 — 요청 경로 그대로 파일을 찾는다.
 * 그래서 /docs/apis/x.html 로 들어오면 산출물도 docs/apis/x.html 에 있어야 한다.
 * 손으로 따로 적으면 base 만 바꾸고 여기를 잊는 순간 전부 404 가 되므로 같이 움직이게 묶는다.
 *   '/'       → .vitepress/dist
 *   '/docs/'  → .vitepress/dist/docs
 */
const docsOutDir = `.vitepress/dist${docsBase}`.replace(/\/$/, '');

/**
 * 사이트의 절대 주소(도메인 + 경로). canonical·sitemap·og:image 가 모두 이걸 기준으로 만든다.
 * **끝의 / 를 지우지 말 것** — sitemap 이 상대 경로('apis/x.html')를 여기에 이어 붙인다.
 */
const siteUrl = `${docsOrigin}${docsBase}`;
// 운영만 색인을 허용한다. develop 이 색인되면 같은 내용이 두 도메인에 뜨는 중복 콘텐츠가 된다.
const indexable = docsEnv === 'production';

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
  // 문서가 정한 순서로 정렬한다(스펙의 선언 순서가 읽는 순서와 다를 수 있다).
  for (const [tag, ops] of byTag) {
    byTag.set(tag, sortOperations(tag, ops));
  }
  return byTag;
}

const byTag = collectTags();
const allTags = [...byTag.keys()];

/**
 * mermaid 가 만들어 내는 청크. 다이어그램 종류마다 하나씩이라 30 개가 넘고, 합쳐서 1MB 에 가깝다.
 *
 * 이름을 열거하는 대신 패턴으로 거르는 이유는 **틀렸을 때 지금 동작으로 되돌아가게** 하려고다 —
 * mermaid 가 판을 바꿔 새 청크 이름을 내놓으면 여기 안 걸리고 그냥 preload 로 남는다(현상 유지).
 * 반대로 열거식이면 새 청크를 놓친 걸 아무도 모른다.
 */
const MERMAID_CHUNK_RE =
  /(diagram|mermaid|katex|dagre|cose-bilkent|swimlanes|-definition)/i;

/**
 * ```mermaid 코드펜스가 실제로 들어 있는 페이지. shouldPreload 의 `page` 인자와 같은 형식이다
 * ('common.md', 'apis/ai.md').
 *
 * 소스를 직접 읽어 판정한다. 목록을 손으로 적어 두면 다이어그램을 새로 넣은 사람이
 * 여기를 고칠 이유를 모르고, 그 페이지만 조용히 느려진다.
 */
function pagesWithMermaid(): Set<string> {
  const root = resolve(__dirname, '..');
  const has = (path: string) =>
    existsSync(path) && readFileSync(path, 'utf-8').includes('```mermaid');

  const pages = new Set<string>();
  // 최상위 마크다운(index.md·common.md 등)은 파일 하나가 페이지 하나다.
  for (const name of readdirSync(root)) {
    if (name.endsWith('.md') && has(resolve(root, name))) pages.add(name);
  }
  // 태그 페이지(/apis/:tag)는 파일이 아니라 apis/notes/*.md 를 조립해 만든다
  // (apis/[tag].paths.js). 노트 이름은 태그 · 태그.after · operationId 셋 중 하나다.
  const notes = resolve(root, 'apis/notes');
  for (const [tag, ops] of byTag) {
    const names = [tag, `${tag}.after`, ...ops.map((op) => op.operationId)];
    if (names.some((name) => has(resolve(notes, `${name}.md`)))) {
      pages.add(`apis/${tag}.md`);
    }
  }
  return pages;
}

/**
 * 태그 페이지(/apis/:tag)의 검색 결과 스니펫.
 *
 * **페이지마다 달라야 한다.** 비워 두면 전부 사이트 기본값("Hans API 명세 문서")을 물려받아
 * 검색 결과에 같은 문장이 열 줄 뜨고, 검색엔진도 페이지를 구분할 근거를 잃는다.
 *
 * 사람이 검색창에 칠 법한 말을 앞에 둔다("병원 검색", "사업자등록번호 조회").
 * 태그를 새로 만들었다면 여기에도 한 줄 적을 것 — 없으면 조용히 기본값으로 떨어진다.
 */
const TAG_DESCRIPTIONS: Record<string, string> = {
  healthcare:
    '전국 병원·의원 검색 API. 지역·진료과목·종별로 찾고 진료시간·응급실·병상·장비·평가등급을 한 번에 받습니다.',
  'healthcare-meta':
    '병원 검색 조건에 넣는 코드표 API. 진료과목·병원 종별·의료장비 코드 목록을 내려받습니다.',
  ai: '자연어 질문을 병원 검색 조건으로 바꾸는 AI 검색 API 와 MCP 엔드포인트. 남은 사용량과 고를 수 있는 모델도 조회합니다.',
  oauth:
    'OAuth 2.0 토큰 발급·갱신 API. Authorization Code + PKCE(S256) 로 인가코드를 accessToken 으로 교환합니다.',
  account:
    '로그인한 사용자의 정보를 조회하는 API. 서비스 키가 아니라 access token 으로 호출합니다.',
  address:
    '시도·시군구 지역 코드 조회와 한글 주소의 공식 영문 표기 변환 API. 좌표로 지역 코드를 찾을 수도 있습니다.',
  business:
    '국세청 사업자등록번호 상태조회·진위확인 API. 계속·휴업·폐업 여부와 과세유형을 확인합니다.',
  transport:
    '지하철역 목록 API. 한국어·영어·일본어 역명을 제공합니다.',
  hira: '건강보험심사평가원(HIRA) 원본 데이터 API. 요양기관기호(ykiho) 기준 병원 목록·상세, 비급여 진료비, 병원평가 등급을 조회합니다.',
  nmc: '국립중앙의료원(NMC) 원본 데이터 API. 기관 ID(hpid) 기준 병원 목록·상세와 달빛어린이병원 목록을 조회합니다.',
};


const mermaidPages = pagesWithMermaid();
console.log(
  `[hansapp-docs] mermaid pages: ${[...mermaidPages].join(', ') || '(none)'}`,
);
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
// AI: 자연어 검색과 사용량 조회. **도메인 위에 둔다** — 경로는 `/healthcare/ai-search` 지만
// 사용자가 찾는 자리는 "병원 API 중 하나" 가 아니라 "AI 로 뭘 할 수 있나" 쪽이다.
// MCP(`POST /mcp/healthcare`)는 스펙에 없어(RPC 라 @ApiExcludeController) 노트의 앵커로만 건다.
const AI_TAGS = ['ai'];
// 계정: 토큰 발급(oauth)과 access token 으로 부르는 사용자 API(account).
// 공통 문서가 흐름을 설명하고, 여기는 그 흐름에 쓰이는 엔드포인트다.
// account 는 백엔드 태그가 아니라 문서가 붙인 이름이다(.vitepress/openapi-spec.ts 참고).
const ACCOUNT_TAG_LABELS: Record<string, string> = {
  oauth: '토큰',
  account: '사용자',
};
const ACCOUNT_TAGS = Object.keys(ACCOUNT_TAG_LABELS);
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
const aiTags = allTags.filter((t) => AI_TAGS.includes(t));
const accountTags = ACCOUNT_TAGS.filter((t) => allTags.includes(t));
const transportTags = allTags.filter((t) => TRANSPORT_TAGS.includes(t));
const addressTags = allTags.filter((t) => ADDRESS_TAGS.includes(t));
// 스펙에 실제로 있는 태그만, BUSINESS_TAG_LABELS 에 적은 순서대로.
const businessTags = BUSINESS_TAGS.filter((t) => allTags.includes(t));
// 어느 그룹에도 매핑되지 않은 나머지 태그는 모두 '기타'로 간다.
//
// **여기 쌓이면 사이드바가 무너진다.** 그룹을 안 적은 태그는 오퍼레이션이 통째로 평평하게
// 나열되므로, 태그 하나만 빠져도 '기타' 가 사이드바의 절반을 먹는다.
// 서버에 @ApiTags 를 새로 만들었다면 위 목록 중 하나에 적을 것.
// (문서에 아예 안 낼 태그는 여기가 아니라 .vitepress/openapi-spec.ts 의 PRIVATE_TAGS 다)
const etcTags = allTags.filter(
  (t) =>
    !ORIGIN_TAGS.includes(t) &&
    !HEALTHCARE_TAGS.includes(t) &&
    !AI_TAGS.includes(t) &&
    !ACCOUNT_TAGS.includes(t) &&
    !TRANSPORT_TAGS.includes(t) &&
    !ADDRESS_TAGS.includes(t) &&
    !BUSINESS_TAGS.includes(t),
);
// 상단 nav 의 'API' 가 착지하는 곳. **주력 API(헬스케어 병원 검색)여야 한다.**
// 예전엔 originTags[0](=hira)로 가서, 문서를 처음 여는 사람이 정부데이터 원본부터 만났다.
// 원본은 대부분 쓸 일이 없는데도 제일 먼저 보이니 그게 주력인 줄 알게 된다.
const landingTag = healthcareTags[0] ?? allTags[0];

/**
 * 태그 페이지가 속한 상위 그룹. 사이드바(themeConfig.sidebar)의 2단 구조를 그대로 쓴다.
 *
 * 빵부스러기(BreadcrumbList) 를 만들려고 둔다. 사이드바와 **같은 상수를 참조**하므로
 * 태그를 그룹에 새로 넣으면 빵부스러기도 따라온다 — 두 곳을 맞춰 적을 일이 없다.
 *
 * ai·transport·address 는 여기 없다. 그것들은 그룹이 곧 페이지라, 넣으면
 * 'AI › AI' 처럼 같은 말이 두 번 나온다.
 */
const BREADCRUMB_GROUPS: Array<{ name: string; tags: string[] }> = [
  { name: '계정', tags: ACCOUNT_TAGS },
  { name: '헬스케어', tags: HEALTHCARE_TAGS },
  { name: '국세청', tags: BUSINESS_TAGS },
  { name: '정부데이터 원본', tags: ORIGIN_TAGS },
];

/**
 * 그룹 단계의 이름과 주소. 그룹은 사이드바의 묶음일 뿐 자기 페이지가 없어서
 * **그 그룹의 첫 태그 페이지를 주소로 빌려 준다** — 마지막 항목이 아닌 단계에는
 * 주소가 있어야 검색엔진이 유효한 빵부스러기로 받아들인다.
 */
function breadcrumbGroupOf(tag: string): { name: string; url: string } | null {
  const group = BREADCRUMB_GROUPS.find((g) => g.tags.includes(tag));
  if (!group) return null;
  const first = group.tags.find((t) => allTags.includes(t));
  return first ? { name: group.name, url: `${siteUrl}apis/${first}` } : null;
}

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
  //
  // README.md 는 이 프로젝트를 고치는 사람에게 쓴 개발 문서다. 빼지 않으면 /README.html 로
  // 배포되어 검색에 잡힌다 — 대외 문서 사이트에 내부 빌드 설명이 노출된다.
  srcExclude: ['apis/notes/**', 'README.md'],
  // 다크/라이트 토글은 유지하되 기본값은 다크다.
  //
  // 'dark' 는 'force-dark' 와 다르다 — 토글은 그대로 있고, 저장된 선택이 없을 때만
  // (OS 가 라이트여도) 다크로 시작한다. 사용자가 라이트로 바꾸면 그 선택이 유지된다.
  //
  // 예전엔 appearance: true + head 스크립트로 localStorage 에 'light' 를 시드했다.
  // 지금은 VitePress 가 넣는 인라인 스크립트가 폴백을 'dark' 로 잡아 주므로 시드가 필요 없다.
  // (직접 시드하면 사용자가 고른 값을 덮어써서 토글이 먹지 않는다)
  appearance: 'dark',
  // 완전 정적 사이트(vitepress build). 둘은 반드시 같이 움직인다(위 docsOutDir 주석 참고).
  base: docsBase,
  outDir: docsOutDir,
  /*
    주소에서 .html 을 뗀다. **취향이 아니라 호스팅에 맞추는 것이다.**

    Workers 정적 자산은 html_handling 기본값이 auto-trailing-slash 라, /docs/common.html 로
    들어오면 307 로 /docs/common 에 보내고 거기서 응답한다. 이걸 끄지 않는 한 실제 주소는
    확장자 없는 쪽이다.

    그런데 cleanUrls 가 false 면 canonical 과 sitemap 이 .html 주소를 가리킨다 —
    **정본이라고 선언한 주소가 정작 리다이렉트되는** 모순이 생긴다.
    산출물 파일명은 그대로 foo.html 이고 링크 표기만 바뀌므로, 배치는 건드리지 않는다.
  */
  cleanUrls: true,
  // 검색엔진에 넘길 페이지 목록. hostname 은 필수다(절대 URL 규격).
  // 경로까지 준다 — 여기에 각 페이지의 상대 경로가 이어 붙어 /docs/apis/x.html 이 된다.
  sitemap: { hostname: siteUrl },
  /**
   * 다이어그램이 없는 페이지에서 mermaid 청크를 preload 에서 뺀다.
   *
   * mermaid 는 테마에 전역 등록되어 **모든 페이지의 import 그래프에 잡힌다**. 그래서
   * 다이어그램이 하나도 없는 페이지까지 1MB 어치를 최우선순위로 받느라 첫 화면이 밀렸다
   * (실제로 다이어그램을 쓰는 건 common.md 한 곳뿐이다).
   *
   * false 를 주면 사라지는 게 아니라 prefetch 로 내려간다 — 브라우저가 한가할 때 받으므로
   * 첫 화면 렌더와 경쟁하지 않는다. **판정이 틀려도 다이어그램은 그대로 그려진다**, 조금 늦을 뿐이다.
   */
  shouldPreload(link, page) {
    if (!MERMAID_CHUNK_RE.test(link)) return true;
    return mermaidPages.has(page);
  },
  /**
   * 태그 페이지에 개별 description 을 심는다.
   *
   * 태그 페이지는 파일이 아니라 [tag].md 하나를 동적 라우트로 찍어 내는 것이라
   * frontmatter 로는 페이지마다 다른 값을 못 준다. 그래서 params.tag 를 보고 여기서 넣는다.
   * (index.md·common.md 처럼 실제 파일이 있는 페이지는 frontmatter 에 직접 적는다)
   */
  transformPageData(pageData) {
    const tag = (pageData.params as { tag?: string } | undefined)?.tag;
    const description = tag ? TAG_DESCRIPTIONS[tag] : undefined;
    if (description) pageData.description = description;
  },
  /**
   * 페이지마다 정본 주소(canonical)와 공유용 메타(og·twitter)를 넣는다.
   *
   * canonical 이 필요한 이유: Cloudflare 가 `/apis/healthcare` 와 `/apis/healthcare.html` 을
   * **둘 다** 서빙한다. 검색엔진에는 같은 내용의 주소가 둘로 보이므로 하나를 정본으로 못박는다.
   * 형식은 sitemap 과 맞춘다(`.html` 붙은 쪽) — 둘이 어긋나면 정본이 두 개인 셈이 된다.
   */
  transformHead({ pageData, title, description }) {
    // relativePath: 'index.md' | 'common.md' | 'apis/healthcare.md'
    // cleanUrls 를 켰으므로 확장자를 뗀다(sitemap 도 같은 규칙으로 만든다).
    const path = pageData.relativePath
      .replace(/(^|\/)index\.md$/, '$1')
      .replace(/\.md$/, '');
    // siteUrl 이 이미 / 로 끝난다. sitemap 이 만드는 주소와 **글자까지 같아야** 한다 —
    // 어긋나면 정본이 둘인 셈이 되어 canonical 이 하는 일이 없어진다.
    const url = `${siteUrl}${path}`;

    const tags: HeadConfig[] = [
      ['link', { rel: 'canonical', href: url }],
      ['meta', { property: 'og:type', content: 'website' }],
      ['meta', { property: 'og:site_name', content: 'Hans API' }],
      ['meta', { property: 'og:locale', content: 'ko_KR' }],
      ['meta', { property: 'og:url', content: url }],
      ['meta', { property: 'og:title', content: title }],
      ['meta', { property: 'og:description', content: description }],
      // 미리보기 카드 이미지. **절대 URL 이어야 한다** — 카드를 그리는 쪽(슬랙·카카오·X)은
      // 우리 사이트 밖이라 상대 경로를 풀 기준이 없다.
      // 원본은 .vitepress/og-source.html (헤드리스 크롬으로 1200×630 스크린샷).
      ['meta', { property: 'og:image', content: `${siteUrl}og.png` }],
      ['meta', { property: 'og:image:width', content: '1200' }],
      ['meta', { property: 'og:image:height', content: '630' }],
      ['meta', { property: 'og:image:alt', content: 'Hans API 문서' }],
      // summary 는 작은 정사각 썸네일, summary_large_image 는 1200×630 을 꽉 채운다.
      ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ];

    /*
      운영이 아니면 색인을 막는다.

      robots.txt 의 Disallow 만으로는 부족하다 — 그건 **크롤링**을 막을 뿐이라, 외부 어딘가에
      develop 주소 링크가 있으면 내용을 안 읽은 채로 주소만 검색결과에 올린다.
      noindex 는 페이지를 읽은 크롤러에게 직접 빼라고 말하는 것이라 확실하다.
    */
    if (!indexable) {
      tags.push(['meta', { name: 'robots', content: 'noindex, nofollow' }]);
    }

    /*
      Schema.org 구조화 데이터(JSON-LD).

      **순위를 올려 주지 않는다.** 구글 문서가 말하는 효과는 리치 결과 "자격" 이 생긴다는
      것까지고, 표시될지는 별개다. 여기서 실제로 눈에 보이는 건 검색 결과의 주소 자리가
      'Hans API › 헬스케어 › 병원' 으로 바뀌는 것 하나다(클릭률에만 영향).

      기계가 문서를 읽는 통로이기도 하다 — API 문서라 그쪽 값이 더 클 수 있다.
    */
    const site = { '@type': 'WebSite', name: 'Hans API', url: siteUrl };
    const ld: Array<Record<string, unknown>> = [];
    const tag = (pageData.params as { tag?: string } | undefined)?.tag;
    const isHome = pageData.relativePath === 'index.md';

    // 404 는 색인 대상이 아니다. 'Hans API › 404' 같은 빵부스러기가 나갈 이유가 없다.
    if (pageData.relativePath === '404.md') return tags;

    if (isHome) {
      ld.push({
        ...site,
        description,
        publisher: { '@type': 'Organization', name: 'Hans API', url: docsOrigin },
      });
    } else {
      // 홈에는 빵부스러기를 넣지 않는다 — 자기 자신 하나뿐이라 의미가 없다.
      const group = tag ? breadcrumbGroupOf(tag) : null;
      /*
        그룹이 자기 대표 페이지와 같은 주소면 그 단계를 뺀다.

        그룹은 페이지가 없어 첫 태그 페이지의 주소를 빌리는데, 지금 보고 있는 페이지가
        바로 그 첫 태그면 '헬스케어 › 병원' 두 단계가 **같은 주소**를 가리키게 된다.
        중간 단계는 item 이 필수라 주소를 비울 수도 없다(구글 규격). 그래서 뺀다 —
        같은 곳을 두 번 가리키는 것보다 한 단계 짧은 쪽이 맞다.
      */
      const trail = [
        { name: 'Hans API', url: siteUrl },
        ...(group && group.url !== url ? [group] : []),
        { name: pageData.title, url },
      ];
      ld.push({
        '@type': 'BreadcrumbList',
        itemListElement: trail.map((step, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: step.name,
          item: step.url,
        })),
      });
      // 태그 페이지는 엔드포인트 명세라 APIReference, 그 밖(공통)은 기술 문서다.
      ld.push({
        '@type': tag ? 'APIReference' : 'TechArticle',
        name: pageData.title,
        description,
        url,
        inLanguage: 'ko-KR',
        isPartOf: site,
      });
    }

    for (const item of ld) {
      tags.push([
        'script',
        { type: 'application/ld+json' },
        JSON.stringify({ '@context': 'https://schema.org', ...item }),
      ]);
    }
    return tags;
  },
  /**
   * robots.txt 를 산출물에 직접 쓴다.
   *
   * public/robots.txt 로 두지 않는 이유는 **내용이 환경마다 달라서**다 —
   * 운영은 전체 허용 + sitemap 위치를, develop 은 전체 차단을 내보내야 하는데
   * 정적 파일 하나로는 못 가른다.
   *
   * **다만 문서가 /docs 밑에 있으면 우리가 낼 수 없다.** 크롤러는 도메인 루트의
   * /robots.txt 만 읽는다 — /docs/robots.txt 는 쳐다보지 않는다. 그 자리는 포털
   * (frontend/hansapp-web)의 것이라, 여기서는 내용만 알려 주고 파일은 만들지 않는다.
   * 있으나 마나 한 파일을 놔두면 "robots 는 처리했다" 고 착각하게 된다.
   *
   * develop 색인 차단은 robots.txt 가 아니라 transformHead 의 noindex 메타가 맡는다.
   * 그쪽은 페이지마다 붙으므로 문서가 어느 경로에 있든 동작한다.
   */
  buildEnd(siteConfig) {
    const body = indexable
      ? `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}sitemap.xml\n`
      : `User-agent: *\nDisallow: /\n`;

    if (docsBase !== '/') {
      /*
        워커 루트로 들어온 요청을 문서 첫 화면으로 보낸다.

        산출물이 docs/ 밑으로 내려가면서 워커 루트에는 파일이 하나도 없다. 그래서 워커
        자기 도메인(workers.dev·남아 있는 커스텀 도메인)으로 들어오면 404 만 보인다 —
        배포가 깨진 것처럼 보이지만 멀쩡한 상태다. 그 혼동을 없애는 안전장치다.

        운영 경로(plzhans.com/docs*)로는 애초에 여기 안 걸린다. Route 가 /docs* 만
        이 워커로 보내고 / 는 포털이 가져가기 때문이다.

        **정적 자산 디렉터리 루트**에 둬야 한다(outDir 이 아니라 wrangler 가 올리는 곳).
        301 이 아니라 302 를 쓴다 — 안전장치일 뿐이라 브라우저에 영구 캐시될 이유가 없고,
        base 가 바뀌면 낡은 301 이 남아 되레 방해가 된다.
      */
      const assetsRoot = resolve(__dirname, 'dist');
      writeFileSync(
        join(assetsRoot, '_redirects'),
        `# 워커 루트 → 문서 첫 화면 (.vitepress/config.ts 가 생성한다)\n/\t${docsBase}\t302\n`,
        'utf-8',
      );
      console.log(`[hansapp-docs] _redirects: / → ${docsBase} (302)`);
      console.log(
        `[hansapp-docs] robots.txt: 생략 — 문서가 ${docsBase} 밑이라 우리가 낼 수 없다.` +
          `\n  ${docsOrigin}/robots.txt 를 포털(hansapp-web)이 내야 한다. 필요한 내용:\n` +
          body.replace(/^/gm, '    '),
      );
      return;
    }
    writeFileSync(join(siteConfig.outDir, 'robots.txt'), body, 'utf-8');
    console.log(
      `[hansapp-docs] robots.txt: ${indexable ? 'allow' : 'disallow'} (${docsEnv})`,
    );
  },
  themeConfig: {
    nav: [
      { text: '소개', link: '/' },
      { text: '공통', link: '/common' },
      { text: 'API', link: `/apis/${landingTag}` },
      /*
        포털로 돌아가는 길. 문서가 포털의 /docs 밑이라 사용자는 여기까지 타고 들어온다 —
        돌아갈 통로가 없으면 뒤로가기 말고는 방법이 없다.

        target·noIcon 을 준 이유는 **같은 사이트라서**다. VitePress 는 절대 주소를 보면
        외부 링크로 판단해 새 탭(_blank)에 열고 화살표 아이콘을 붙이는데, 배포 환경에서
        포털은 같은 도메인이다. 새 탭이 쌓이는 것도, 남의 사이트로 나가는 표시도 어색하다.
      */
      { text: 'HOME', link: portalOrigin, target: '_self', noIcon: true },
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
          { text: '로그인 연동', link: '/common#login-integration' },
          { text: '소셜 제공자 등록', link: '/common#social-provider' },
          { text: '토큰 만료', link: '/common#token-ttl' },
          { text: 'JWT 검증', link: '/common#jwt-verify' },
          { text: '다국어', link: '/common#다국어' },
        ],
      },
      // 계정: 로그인 연동에 실제로 쓰이는 엔드포인트. 흐름 설명은 /common 이 한다.
      ...(accountTags.length
        ? [
            {
              text: '계정',
              collapsed: false,
              items: accountTags.map((t) => ({
                text: ACCOUNT_TAG_LABELS[t],
                link: `/apis/${t}`,
              })),
            },
          ]
        : []),
      // AI: 도메인 위에 둔다. 오퍼레이션 둘과, 스펙에 없는 MCP 는 노트 앵커로 건다.
      ...(aiTags.length
        ? [
            {
              text: 'AI',
              link: '/apis/ai',
              collapsed: false,
              items: [
                ...aiTags.flatMap(opItems),
                { text: 'MCP', link: '/apis/ai#mcp' },
              ],
            },
          ]
        : []),
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
      // Sentry 가 쓰는 값. 환경 이름은 DOCS_ENV(배포 스크립트), release 는 버전+커밋.
      // DSN 은 여기 없다 — .env.<환경> 의 VITE_SENTRY_DSN 을 theme/sentry.ts 가 직접 읽는다.
      __APP_ENV__: JSON.stringify(docsEnv),
      __APP_RELEASE__: JSON.stringify(`${pkg.version}-${gitSha}`),
      // 푸터에 노출할 대표 이메일. hansapp-web 의 VITE_CONTACT_EMAIL 과 같은 값을 쓴다
      // (약관·방침 안에 박힌 연락처는 별개다 — 그쪽은 고치면 개정이라 공지 대상이다).
      __CONTACT_EMAIL__: JSON.stringify(
        process.env.VITE_CONTACT_EMAIL ?? 'plzhans@gmail.com',
      ),
    },
    // mermaid 최적화(dayjs·cytoscape 등 하위 의존 pre-bundle)는 withMermaid 플러그인이
    // optimizeDeps.include 로 이미 넣는다. pnpm 에서 그 베어 이름들이 resolve 되도록
    // 하위 의존을 root 로 hoist 하는 설정은 .npmrc(public-hoist-pattern)에 있다.
    // 포트를 지정(--port)하지 않으면 8801 을 기본으로 쓴다.
    server: { port: 8801 },
    preview: { port: 8801 },
  },
}));
