import { defineConfig } from 'vitepress';
import { loadSpec, specPath } from './openapi-spec';

// 스펙을 빌드 시 파일에서 읽는다. 경로는 OPENAPI_SPEC 환경변수로 오버라이드 가능하다.
const spec = loadSpec();
// 빌드 로그에 실제 사용한 스펙 경로를 남긴다(CI 디버깅용).
console.log(`[hansapi-docs] OpenAPI spec: ${specPath}`);

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
const HEALTHCARE_TAGS = ['healthcare'];
const originTags = allTags.filter((t) => ORIGIN_TAGS.includes(t));
const healthcareTags = allTags.filter((t) => HEALTHCARE_TAGS.includes(t));
// 원본/헬스케어에 매핑되지 않은 나머지 태그는 모두 '기타'로 간다.
const etcTags = allTags.filter(
  (t) => !ORIGIN_TAGS.includes(t) && !HEALTHCARE_TAGS.includes(t),
);
const firstTag = originTags[0] ?? allTags[0];

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

export default defineConfig({
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
  base: '/',
  themeConfig: {
    nav: [
      { text: '소개', link: '/' },
      { text: '인증', link: '/auth' },
      { text: 'API', link: `/apis/${firstTag}` },
    ],
    sidebar: [
      {
        text: '시작하기',
        items: [
          { text: '소개', link: '/' },
          { text: '인증', link: '/auth' },
        ],
      },
      // 헬스케어: 통합 API. '병원 검색' 하위에 통합 병원 오퍼레이션(앵커)을 나열한다.
      ...(healthcareTags.length
        ? [
            {
              text: '헬스케어',
              collapsed: false,
              items: healthcareTags.map((t) => tagGroup(t, '병원 검색')),
            },
          ]
        : []),
      {
        // 정부데이터 원본: 매핑된 태그(hira/nmc)마다 한 페이지, 하위는 오퍼레이션 앵커.
        text: '정부데이터 원본',
        collapsed: false,
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
    },
    // 포트를 지정(--port)하지 않으면 8801 을 기본으로 쓴다.
    server: { port: 8801 },
    preview: { port: 8801 },
  },
});
