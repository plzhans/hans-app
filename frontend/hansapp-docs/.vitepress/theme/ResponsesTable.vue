<script setup lang="ts">
import { computed, reactive } from 'vue';

// operationId 로 스펙에서 응답(responses)의 스키마를 읽어 "모델별 표"로 렌더한다.
// 중첩 스키마($ref)는 각각 별도 표로 그리고, 타입 셀에서 해당 표로 앵커 링크한다.
declare const __OPENAPI_SPEC__: Record<string, any>;

const props = defineProps<{ operationId: string }>();
const spec = __OPENAPI_SPEC__;

function findOp(id: string): any {
  for (const pathItem of Object.values(spec?.paths ?? {})) {
    for (const op of Object.values(pathItem as Record<string, any>)) {
      if (op && typeof op === 'object' && op.operationId === id) return op;
    }
  }
  return null;
}

// 한 페이지에 여러 오퍼레이션이 올 수 있으므로 operationId 로 스코프를 준다(앵커 id 충돌 방지).
function slug(name: string): string {
  return `schema-${props.operationId}-${name}`.toLowerCase();
}

// 표시용 이름에서 접미사 Dto 를 제거한다(링크용 slug 는 원래 이름을 그대로 씀).
function displayName(name: string): string {
  return String(name).replace(/Dto$/, '');
}

// $ref 해제(이름과 스키마 반환)
function deref(schema: any): { name?: string; schema: any } {
  if (schema?.$ref) {
    const name = String(schema.$ref).split('/').pop();
    return { name, schema: spec.components?.schemas?.[name!] ?? {} };
  }
  return { schema: schema ?? {} };
}

// allOf 를 하나의 object(properties 병합, required 합집합)로 정규화한다.
function effectiveObject(schema: any): {
  name?: string;
  props: Record<string, any>;
  required: string[];
} {
  const d = deref(schema);
  const sc = d.schema;
  if (sc?.allOf) {
    const merged: Record<string, any> = {};
    const required = new Set<string>();
    let name = d.name;
    for (const member of sc.allOf) {
      const m = effectiveObject(member);
      Object.assign(merged, m.props);
      m.required.forEach((r) => required.add(r));
      if (!name && m.name) name = m.name;
    }
    return { name, props: merged, required: [...required] };
  }
  return {
    name: d.name,
    props: sc?.properties ?? {},
    required: sc?.required ?? [],
  };
}

// 타입 라벨과 참조 스키마 이름을 구한다.
function typeLabel(s: any): { label: string; ref?: string } {
  if (!s) return { label: 'any' };
  if (s.$ref) {
    const n = String(s.$ref).split('/').pop()!;
    return { label: displayName(n), ref: n };
  }
  if (s.allOf) {
    const r = s.allOf.find((m: any) => m.$ref);
    if (r) {
      const n = String(r.$ref).split('/').pop()!;
      return { label: displayName(n), ref: n };
    }
    return { label: 'object' };
  }
  if (s.type === 'array') {
    const it = typeLabel(s.items);
    return { label: `${it.label}[]`, ref: it.ref };
  }
  return { label: s.format ? `${s.type}<${s.format}>` : (s.type ?? 'object') };
}

// 스키마로부터 JSON 샘플 값을 만든다($ref/allOf/array 처리, 순환 방지).
function sampleOf(schema: any, seen: Set<string> = new Set()): any {
  if (!schema) return null;
  if (schema.example !== undefined) return schema.example;
  if (schema.$ref) {
    const name = String(schema.$ref).split('/').pop()!;
    if (seen.has(name)) return null; // 순환 참조 방지
    return sampleOf(spec.components?.schemas?.[name], new Set(seen).add(name));
  }
  if (schema.allOf) {
    const obj: Record<string, any> = {};
    for (const member of schema.allOf) {
      const part = sampleOf(member, seen);
      if (part && typeof part === 'object' && !Array.isArray(part)) {
        Object.assign(obj, part);
      }
    }
    return obj;
  }
  if (schema.type === 'array') return [sampleOf(schema.items, seen)];
  if (schema.type === 'object' || schema.properties) {
    const obj: Record<string, any> = {};
    for (const [k, v] of Object.entries(schema.properties ?? {})) {
      obj[k] = sampleOf(v, seen);
    }
    return obj;
  }
  if (schema.default !== undefined) return schema.default;
  switch (schema.type) {
    case 'string':
      return schema.format === 'date-time' ? '2024-01-01T00:00:00Z' : 'string';
    case 'integer':
    case 'number':
      return 0;
    case 'boolean':
      return true;
    default:
      return null;
  }
}

// JSON 문자열에 구문 강조용 span 을 입힌다(의존성 없는 정규식 하이라이터).
// 값은 우리가 JSON.stringify 로 만든 것이고 &<> 를 먼저 이스케이프하므로 v-html 안전.
function highlightJson(json: string): string {
  const escaped = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = 'oa-j-num';
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? 'oa-j-key' : 'oa-j-str';
      } else if (/true|false/.test(match)) {
        cls = 'oa-j-bool';
      } else if (/null/.test(match)) {
        cls = 'oa-j-null';
      }
      return `<span class="${cls}">${match}</span>`;
    },
  );
}

interface TableRow {
  key: string;
  name: string;
  type: string;
  ref?: string; // 있으면 해당 모델 표(#slug)로 점프하는 링크로 렌더
  required: boolean;
  description: string;
  depth: number; // 평탄화 표에서 들여쓰기 깊이(루트 표는 항상 0)
}

// 배열 래핑을 벗겨 요소 스키마를 돌려준다(중첩 배열도 끝까지 벗김).
function unwrapArray(schema: any): any {
  let cur = schema;
  while (cur?.type === 'array' && cur.items) cur = cur.items;
  return cur;
}

// object 스키마를 평탄화한다: 자식·손자 object(중첩)를 별도 표로 나누지 않고
// 같은 표에 depth 를 늘려가며 이어 붙인다. ancestors 로 순환 참조는 펼치지 않는다.
function flattenObject(
  schema: any,
  depth: number,
  ancestors: Set<string>,
  rows: TableRow[],
): void {
  const eff = effectiveObject(unwrapArray(schema));
  for (const [name, ps] of Object.entries<any>(eff.props)) {
    const tl = typeLabel(ps);
    rows.push({
      key: `${depth}:${name}:${rows.length}`,
      name,
      type: tl.label,
      required: eff.required.includes(name),
      description: ps?.description ?? '',
      depth,
    });
    // (배열을 벗긴 뒤) 펼칠 프로퍼티를 가진 object 면 바로 아래에 들여써서 이어 붙인다.
    const child = unwrapArray(ps);
    if (!Object.keys(effectiveObject(child).props).length) continue;
    if (tl.ref && ancestors.has(tl.ref)) continue; // 순환: 타입만 남기고 중단
    flattenObject(
      child,
      depth + 1,
      tl.ref ? new Set(ancestors).add(tl.ref) : ancestors,
      rows,
    );
  }
}

// 하이브리드: 루트 객체는 지금처럼 한 단계(직속 필드)만 표로 그리고,
// 루트가 "직접" 참조한 객체마다 표를 하나씩 그리되, 그 안의 서브 객체(중첩)는
// 별도 표로 더 쪼개지 않고 한 표에 평탄화해서 담는다.
function collectTables(rootSchema: any) {
  const tables: Array<{ title: string; id: string; rows: TableRow[] }> = [];

  // 1) 루트 표 — 직속 필드만. object 참조는 아래 모델 표로 링크한다.
  const rootEff = effectiveObject(unwrapArray(rootSchema));
  const rootEntries = Object.entries<any>(rootEff.props);
  if (!rootEntries.length) return tables; // 원시 루트는 표 없음

  const directRefs: string[] = [];
  const rootRows: TableRow[] = rootEntries.map(([name, ps], i) => {
    const tl = typeLabel(ps);
    if (tl.ref && !directRefs.includes(tl.ref)) directRefs.push(tl.ref);
    return {
      key: `root:${name}:${i}`,
      name,
      type: tl.label,
      ref: tl.ref,
      required: rootEff.required.includes(name),
      description: ps?.description ?? '',
      depth: 0,
    };
  });
  tables.push({
    title: displayName(rootEff.name ?? 'Response'),
    id: slug(rootEff.name ?? 'Response'),
    rows: rootRows,
  });

  // 2) 루트가 직접 참조한 객체마다 "평탄화된" 표 하나씩.
  for (const ref of directRefs) {
    const rows: TableRow[] = [];
    flattenObject(
      { $ref: `#/components/schemas/${ref}` },
      0,
      new Set([ref]),
      rows,
    );
    if (!rows.length) continue;
    tables.push({ title: displayName(ref), id: slug(ref), rows });
  }
  return tables;
}

const responses = computed(() => {
  const op = findOp(props.operationId);
  const out: Array<{
    status: string;
    description: string;
    primitive?: string;
    tables: ReturnType<typeof collectTables>;
    jsonHtml?: string;
  }> = [];
  for (const [status, res] of Object.entries<any>(op?.responses ?? {})) {
    const content = res.content ?? {};
    const schema =
      content['application/json']?.schema ??
      content[Object.keys(content)[0]]?.schema;
    if (!schema) {
      out.push({ status, description: res.description ?? '', tables: [] });
      continue;
    }
    const tables = collectTables(schema);
    // object 가 아니면(원시 타입) 표 대신 타입만 표기
    const primitive = tables.length ? undefined : typeLabel(schema).label;
    const jsonHtml = highlightJson(JSON.stringify(sampleOf(schema), null, 2));
    out.push({
      status,
      description: res.description ?? '',
      primitive,
      tables,
      jsonHtml,
    });
  }
  return out;
});

// 응답 상태별 활성 탭(table | json). 기본은 table.
const activeTab = reactive<Record<string, 'table' | 'json'>>({});
function tabOf(status: string): 'table' | 'json' {
  return activeTab[status] ?? 'table';
}
</script>

<template>
  <h2 v-if="responses.length" class="oa-section-title">Response</h2>
  <div v-for="r in responses" :key="r.status" class="oa-res-group">
    <h3>
      <span class="oa-res-status">{{ r.status }}</span>
      <span v-if="r.description"> — {{ r.description }}</span>
    </h3>

    <p v-if="!r.tables.length && r.primitive">타입: <code>{{ r.primitive }}</code></p>
    <p v-else-if="!r.tables.length">본문 없음</p>

    <template v-if="r.tables.length">
      <!-- Table / JSON 탭 -->
      <div class="oa-tabs" role="tablist">
        <button
          type="button"
          class="oa-tab"
          :class="{ active: tabOf(r.status) === 'table' }"
          @click="activeTab[r.status] = 'table'"
        >
          Table
        </button>
        <button
          type="button"
          class="oa-tab"
          :class="{ active: tabOf(r.status) === 'json' }"
          @click="activeTab[r.status] = 'json'"
        >
          JSON
        </button>
      </div>

      <!-- Table 탭 -->
      <div v-show="tabOf(r.status) === 'table'">
        <template v-for="t in r.tables" :key="t.id">
          <h4 :id="t.id">{{ t.title }}</h4>
          <table class="oa-params-table">
            <thead>
              <tr>
                <!--
                  요청·응답 모두 'Required' 로 단어를 맞춘다. required 는 OpenAPI/JSON
                  Schema 의 객체 스키마 키워드라 요청 바디든 응답 바디든 똑같이 쓴다 —
                  "이 키가 그 객체에 반드시 있다" 는 뜻이고, 문맥에 따라 누가 보증하냐만 바뀐다.
                    요청  required = 클라이언트가 반드시 **보내야** 한다  (의무)
                    응답  required = 서버가 반드시 **준다**              (보증)
                  뜻이 갈리는 건 배지의 title(툴팁)로 풀어 준다.
                -->
                <th>Field</th>
                <th>Type</th>
                <th>Required</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in t.rows"
                :key="row.key"
                :class="{ 'oa-p-nested': row.depth > 0 }"
              >
                <td class="oa-p-name">
                  <span
                    class="oa-p-indent"
                    :style="{ paddingLeft: row.depth * 1.25 + 'rem' }"
                  >
                    <span v-if="row.depth > 0" class="oa-p-branch">└─</span>
                    <code>{{ row.name }}</code>
                  </span>
                </td>
                <td class="oa-p-type">
                  <a v-if="row.ref" :href="`#${slug(row.ref)}`">{{ row.type }}</a>
                  <span v-else>{{ row.type }}</span>
                </td>
                <td class="oa-p-req">
                  <!-- 서버가 항상 준다 = 클라이언트가 null 체크를 안 해도 된다. -->
                  <span
                    v-if="row.required"
                    class="oa-p-required"
                    title="서버가 항상 내려주는 필드입니다. 없을 일이 없습니다."
                    >required</span
                  >
                  <!-- 없을 수 있다 = 폴백을 준비해야 한다. -->
                  <span
                    v-else
                    class="oa-p-optional"
                    title="값이 없으면 이 필드는 응답에서 생략됩니다."
                    >optional</span
                  >
                </td>
                <td class="oa-p-desc">{{ row.description }}</td>
              </tr>
            </tbody>
          </table>
        </template>
      </div>

      <!-- JSON 탭(스키마 기반 자동 생성 샘플) -->
      <div v-show="tabOf(r.status) === 'json'">
        <pre class="oa-json"><code v-html="r.jsonHtml"></code></pre>
      </div>
    </template>
  </div>
</template>
