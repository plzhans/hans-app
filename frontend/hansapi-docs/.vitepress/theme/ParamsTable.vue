<script setup lang="ts">
import { computed, ref } from 'vue';
import { withBase } from 'vitepress';

// operationId 로 스펙에서 해당 오퍼레이션의 parameters 를 찾아 표(table)로 렌더한다.
// 스펙은 config.ts 의 vite.define 로 주입된 전역 __OPENAPI_SPEC__ 를 사용한다.
declare const __OPENAPI_SPEC__: Record<string, any>;

const props = defineProps<{ operationId: string }>();

// 이 오퍼레이션이 인증(security)을 요구하는지 여부.
const requiresAuth = computed<boolean>(() => {
  const spec = __OPENAPI_SPEC__;
  for (const pathItem of Object.values(spec?.paths ?? {})) {
    for (const op of Object.values(pathItem as Record<string, any>)) {
      if (op && typeof op === 'object' && op.operationId === props.operationId) {
        const sec = op.security !== undefined ? op.security : (spec?.security ?? []);
        return Array.isArray(sec) && sec.length > 0;
      }
    }
  }
  return false;
});

// 엔드포인트(메서드 + 경로)와 파라미터를 한 번에 찾는다.
const endpoint = computed<{ method: string; path: string } | null>(() => {
  const spec = __OPENAPI_SPEC__;
  for (const [path, pathItem] of Object.entries(spec?.paths ?? {})) {
    for (const [method, op] of Object.entries(
      pathItem as Record<string, any>,
    )) {
      if (op && typeof op === 'object' && op.operationId === props.operationId) {
        return { method: method.toUpperCase(), path };
      }
    }
  }
  return null;
});

// 엔드포인트 경로 복사(우상단 버튼).
const copied = ref(false);
function copyUrl() {
  const path = endpoint.value?.path;
  if (!path || !navigator?.clipboard) return;
  navigator.clipboard.writeText(path).then(() => {
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  });
}

const parameters = computed<any[]>(() => {
  const spec = __OPENAPI_SPEC__;
  for (const pathItem of Object.values(spec?.paths ?? {})) {
    for (const op of Object.values(pathItem as Record<string, any>)) {
      if (op && typeof op === 'object' && op.operationId === props.operationId) {
        return (op.parameters ?? []) as any[];
      }
    }
  }
  return [];
});

const GROUP_LABELS: Record<string, string> = {
  path: 'Path Parameters',
  query: 'Query Parameters',
  header: 'Headers',
  cookie: 'Cookies',
};
const GROUP_ORDER = ['path', 'query', 'header', 'cookie'];

// in(query/path/header/cookie) 별로 묶는다.
const groups = computed(() => {
  const by: Record<string, any[]> = {};
  for (const p of parameters.value) {
    const key = p.in ?? 'query';
    (by[key] ??= []).push(p);
  }
  return GROUP_ORDER.filter((k) => by[k]?.length).map((k) => ({
    key: k,
    label: GROUP_LABELS[k] ?? k,
    items: by[k],
  }));
});

function typeOf(p: any): string {
  const s = p.schema ?? {};
  if (s.type === 'array') return `${s.items?.type ?? 'any'}[]`;
  if (s.$ref) return String(s.$ref).split('/').pop() ?? '';
  return s.type ?? '';
}

function constraintsOf(p: any): string {
  const s = p.schema ?? {};
  const bits: string[] = [];
  if (s.minimum !== undefined) bits.push(`min ${s.minimum}`);
  if (s.maximum !== undefined) bits.push(`max ${s.maximum}`);
  if (s.minLength !== undefined) bits.push(`minLen ${s.minLength}`);
  if (s.maxLength !== undefined) bits.push(`maxLen ${s.maxLength}`);
  if (Array.isArray(s.enum)) bits.push(`enum: ${s.enum.join(', ')}`);
  if (s.default !== undefined) bits.push(`default ${s.default}`);
  return bits.join(' · ');
}
</script>

<template>
  <!-- Request 타이틀 줄. 오른쪽 끝에 인증 필요 표시(강조 X). -->
  <div v-if="endpoint || groups.length" class="oa-request-head">
    <h2 class="oa-section-title">Request</h2>
    <span v-if="requiresAuth" class="oa-auth-note">
      🔒 Bearer 인증 필요 · <a :href="withBase('/auth')">인증 방법</a>
    </span>
  </div>

  <!-- 엔드포인트(메서드 + 경로)를 코드블록 박스로. 우상단에 복사 버튼. -->
  <div v-if="endpoint" class="oa-endpoint">
    <div class="oa-endpoint-main">
      <span
        class="oa-method"
        :class="`oa-method--${endpoint.method.toLowerCase()}`"
        >{{ endpoint.method }}</span
      >
      <code class="oa-endpoint-path">{{ endpoint.path }}</code>
    </div>
    <button type="button" class="oa-copy" aria-label="Copy URL" @click="copyUrl">
      {{ copied ? 'Copied' : 'Copy' }}
    </button>
  </div>

  <div v-for="g in groups" :key="g.key" class="oa-params-group">
    <h3>{{ g.label }}</h3>
    <table class="oa-params-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Type</th>
          <th>Required</th>
          <th>Constraints</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="p in g.items" :key="p.name">
          <td class="oa-p-name"><code>{{ p.name }}</code></td>
          <td class="oa-p-type">{{ typeOf(p) }}</td>
          <td class="oa-p-req">
            <!-- 응답 표(ResponsesTable)와 단어를 맞춘다: required / optional. -->
            <span
              v-if="p.required"
              class="oa-p-required"
              title="반드시 보내야 하는 파라미터입니다. 없으면 요청이 거부됩니다."
              >required</span
            >
            <span
              v-else
              class="oa-p-optional"
              title="생략할 수 있는 파라미터입니다."
              >optional</span
            >
          </td>
          <td class="oa-p-constraints">{{ constraintsOf(p) }}</td>
          <td class="oa-p-desc">{{ p.description }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
