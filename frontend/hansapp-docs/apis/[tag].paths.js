import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadSpec, sortOperations } from '../.vitepress/openapi-spec';

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

// 노트 파일을 읽어 반환한다(apis/notes/<name>.md). 없으면 빈 문자열.
function readNote(name) {
  const notePath = resolve(process.cwd(), 'apis/notes', `${name}.md`);
  return existsSync(notePath) ? readFileSync(notePath, 'utf-8') : '';
}

// 태그 → 페이지 제목(H1·브라우저 탭). 없으면 태그명(영문)을 그대로 쓴다.
// 사이드바 라벨(.vitepress/config.ts)과 맞춘다.
const TAG_TITLES = {
  ai: 'AI',
  oauth: '토큰',
  account: '사용자',
  healthcare: '병원',
  'healthcare-meta': '참조 데이터',
  transport: '교통정보',
  business: '사업자',
  address: '주소',
  hira: '건강보험심사평가원 원본',
  nmc: '국립중앙의료원 원본',
};
const titleOf = (tag) => TAG_TITLES[tag] ?? tag;

// 사이드바에서 3뎁스(오퍼레이션)를 지운 태그들. 대신 페이지 최상단에 엔드포인트 목록을 넣어
// 오퍼레이션으로 바로 점프할 수 있게 한다. (config.ts 의 2뎁스 그룹과 일치시킨다)
const ENDPOINT_INDEX_TAGS = new Set([
  'account',
  'healthcare',
  'healthcare-meta',
  'business',
]);

// 태그마다 한 페이지(/apis/:tag)를 만든다. 페이지 본문(content)은:
//   - 태그 노트(apis/notes/:tag.md)        → 페이지 맨 위에 인라인(페이지 단위 설명)
//   - 각 오퍼레이션마다:
//       - 앵커용 숨은 div(#op-:operationId) → 사이드바에서 점프
//       - 오퍼레이션 노트(apis/notes/:operationId.md) → 있으면 인라인(파일 없으면 생략)
//       - <ApiOperation operation-id=...>   → 스펙 기반 오퍼레이션 UI(표/JSON 탭)
// content 는 VitePress 가 마크다운으로 렌더하므로 Vue 컴포넌트/컨테이너(:::)가 모두 동작한다.
export default {
  paths() {
    const spec = loadSpec();

    const byTag = new Map();
    for (const [path, item] of Object.entries(spec.paths ?? {})) {
      for (const verb of HTTP_VERBS) {
        const op = item?.[verb];
        if (!op) continue;
        const tag = (op.tags && op.tags[0]) || 'default';
        if (!byTag.has(tag)) byTag.set(tag, []);
        byTag.get(tag).push({
          operationId: op.operationId,
          summary: op.summary || op.operationId,
          method: verb.toUpperCase(),
          path,
        });
      }
    }

    return [...byTag.entries()].map(([tag, unordered]) => {
      // 사이드바(config.ts)와 같은 순서 규칙을 쓴다.
      const ops = sortOperations(tag, unordered);
      const parts = [`# ${titleOf(tag)}`];

      // 최상단 엔드포인트 목록 — 사이드바에서 3뎁스를 지운 태그만. 각 항목은 오퍼레이션 앵커로 점프한다.
      if (ENDPOINT_INDEX_TAGS.has(tag) && ops.length) {
        const rows = ops.map(
          (op) =>
            `- [${op.summary}](#op-${op.operationId}) — \`${op.method} ${op.path}\``,
        );
        parts.push(['## 엔드포인트', ...rows].join('\n'));
      }

      // 태그(페이지) 단위 노트 — 오퍼레이션들 앞에 인라인.
      const tagNote = readNote(tag);
      if (tagNote) {
        parts.push(tagNote);
      }

      // 오퍼레이션 앞에 붙는 노트(apis/notes/:tag.md)는 위에서 이미 넣었다.
      for (const op of ops) {
        // 사이드바 #op-:operationId 로 점프할 앵커(숨은 div).
        parts.push(`<div id="op-${op.operationId}" class="oa-op-anchor"></div>`);
        // 오퍼레이션 단위 노트(apis/notes/:operationId.md) 가 있으면 바로 위에 인라인.
        const opNote = readNote(op.operationId);
        if (opNote) {
          parts.push(opNote);
        }
        // 스펙 기반 오퍼레이션 UI(파라미터/응답 표, JSON 탭).
        parts.push(`<ApiOperation operation-id="${op.operationId}" />`);
      }

      /*
        오퍼레이션 **뒤에** 붙는 노트(apis/notes/:tag.after.md).

        앞 노트만 있던 시절에는 오퍼레이션 뒤에 와야 할 내용(예: AI 페이지의 MCP 안내)이
        맨 위로 밀려서, **사이드바 순서와 페이지 순서가 어긋났다** — 사이드바는 그 항목을
        마지막에 두는데 페이지에서는 첫 화면에 있었다.
      */
      const tailNote = readNote(`${tag}.after`);
      if (tailNote) {
        parts.push(tailNote);
      }

      return {
        params: { tag, pageTitle: `${titleOf(tag)} - Hans API` },
        content: parts.join('\n\n'),
      };
    });
  },
};
