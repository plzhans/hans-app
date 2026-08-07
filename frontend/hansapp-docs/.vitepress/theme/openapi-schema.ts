/*
  스펙 스키마를 표로 그리기 위한 공용 유틸.

  **요청 본문과 응답이 같은 규칙으로 그려져야 해서 여기 모았다.** 둘 다 JSON Schema 이고
  독자도 같은 표를 기대한다 — 한쪽에만 고친 규칙이 남으면 같은 스키마가 자리에 따라
  다르게 보인다(ResponsesTable 에만 있던 시절 실제로 요청 본문은 표가 아예 없었다).

  스펙은 config.ts 의 vite.define 로 주입된 전역 __OPENAPI_SPEC__ 를 쓴다.
*/
declare const __OPENAPI_SPEC__: Record<string, any>;

const spec = (): Record<string, any> => __OPENAPI_SPEC__;

/** operationId 로 오퍼레이션을 찾는다. */
export function findOp(id: string): any {
  for (const pathItem of Object.values(spec()?.paths ?? {})) {
    for (const op of Object.values(pathItem as Record<string, any>)) {
      if (op && typeof op === 'object' && op.operationId === id) return op;
    }
  }
  return null;
}

/** 표시용 이름에서 접미사 Dto 를 제거한다(링크용 slug 는 원래 이름을 그대로 씀). */
export function displayName(name: string): string {
  return String(name).replace(/Dto$/, '');
}

/** $ref 해제(이름과 스키마 반환) */
export function deref(schema: any): { name?: string; schema: any } {
  if (schema?.$ref) {
    const name = String(schema.$ref).split('/').pop();
    return { name, schema: spec().components?.schemas?.[name!] ?? {} };
  }
  return { schema: schema ?? {} };
}

/** allOf 를 하나의 object(properties 병합, required 합집합)로 정규화한다. */
export function effectiveObject(schema: any): {
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

/** 타입 라벨과 참조 스키마 이름을 구한다. */
export function typeLabel(s: any): { label: string; ref?: string } {
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

/** 스키마로부터 JSON 샘플 값을 만든다($ref/allOf/array 처리, 순환 방지). */
export function sampleOf(schema: any, seen: Set<string> = new Set()): any {
  if (!schema) return null;
  if (schema.example !== undefined) return schema.example;
  if (schema.$ref) {
    const name = String(schema.$ref).split('/').pop()!;
    if (seen.has(name)) return null; // 순환 참조 방지
    return sampleOf(
      spec().components?.schemas?.[name],
      new Set(seen).add(name),
    );
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
      return schema.enum?.[0] !== undefined
        ? schema.enum[0]
        : schema.format === 'date-time'
          ? '2024-01-01T00:00:00Z'
          : 'string';
    case 'integer':
    case 'number':
      return 0;
    case 'boolean':
      return true;
    default:
      return null;
  }
}

/**
 * JSON 문자열에 구문 강조용 span 을 입힌다(의존성 없는 정규식 하이라이터).
 * 값은 우리가 JSON.stringify 로 만든 것이고 &<> 를 먼저 이스케이프하므로 v-html 안전.
 */
export function highlightJson(json: string): string {
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

/**
 * 값 제약을 한 줄로. **enum 이 핵심이다** — 고를 수 있는 값이 정해져 있는데 타입만 `string`
 * 으로 보이면 무엇을 보내야 할지 알 수 없다(파라미터 표에만 있고 본문·응답 표에 없었다).
 */
export function constraintsOf(s: any): string {
  const bits: string[] = [];
  if (Array.isArray(s?.enum)) bits.push(s.enum.join(', '));
  if (s?.minimum !== undefined) bits.push(`min ${s.minimum}`);
  if (s?.maximum !== undefined) bits.push(`max ${s.maximum}`);
  if (s?.minLength !== undefined) bits.push(`minLen ${s.minLength}`);
  if (s?.maxLength !== undefined) bits.push(`maxLen ${s.maxLength}`);
  if (s?.default !== undefined) bits.push(`default ${s.default}`);
  return bits.join(' · ');
}

export interface TableRow {
  key: string;
  name: string;
  type: string;
  /** 있으면 해당 모델 표(#slug)로 점프하는 링크로 렌더 */
  ref?: string;
  required: boolean;
  description: string;
  /** 값 제약(enum·min·max…). 없으면 빈 문자열이다. */
  constraints: string;
  /** 평탄화 표에서 들여쓰기 깊이(루트 표는 항상 0) */
  depth: number;
}

export interface SchemaTable {
  title: string;
  id: string;
  rows: TableRow[];
}

/** 배열 래핑을 벗겨 요소 스키마를 돌려준다(중첩 배열도 끝까지 벗김). */
export function unwrapArray(schema: any): any {
  let cur = schema;
  while (cur?.type === 'array' && cur.items) cur = cur.items;
  return cur;
}

/**
 * object 스키마를 평탄화한다: 자식·손자 object(중첩)를 별도 표로 나누지 않고
 * 같은 표에 depth 를 늘려가며 이어 붙인다. ancestors 로 순환 참조는 펼치지 않는다.
 */
export function flattenObject(
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
      constraints: constraintsOf(unwrapArray(ps)),
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

/**
 * 하이브리드: 루트 객체는 직속 필드만 표로 그리고, 루트가 "직접" 참조한 객체마다
 * 표를 하나씩 그리되 그 안의 서브 객체(중첩)는 별도 표로 더 쪼개지 않고 평탄화해 담는다.
 *
 * `slug` 는 앵커 id 를 만드는 함수다 — 한 페이지에 오퍼레이션이 여럿이라
 * 부르는 쪽이 operationId 로 스코프를 준다(id 충돌 방지).
 */
export function collectTables(
  rootSchema: any,
  slug: (name: string) => string,
  fallbackTitle: string,
): SchemaTable[] {
  const tables: SchemaTable[] = [];

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
      constraints: constraintsOf(unwrapArray(ps)),
      depth: 0,
    };
  });
  tables.push({
    title: displayName(rootEff.name ?? fallbackTitle),
    id: slug(rootEff.name ?? fallbackTitle),
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
