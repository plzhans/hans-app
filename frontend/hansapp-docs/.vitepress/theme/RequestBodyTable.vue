<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  collectTables,
  findOp,
  highlightJson,
  sampleOf,
  typeLabel,
} from './openapi-schema';

/*
  요청 본문(requestBody)을 응답과 같은 모양의 표로 그린다.

  기본 UI 는 스키마 뷰어 탭만 띄워서 **필드가 무엇인지 한눈에 안 보였다** — 응답은 표로
  그리면서 요청만 다른 규칙이면 같은 스키마가 자리에 따라 다르게 보인다.
*/
const props = defineProps<{ operationId: string }>();

// 한 페이지에 여러 오퍼레이션이 올 수 있으므로 operationId 로 스코프를 준다(앵커 id 충돌 방지).
function slug(name: string): string {
  return `reqschema-${props.operationId}-${name}`.toLowerCase();
}

const body = computed(() => {
  const op = findOp(props.operationId);
  const content = op?.requestBody?.content ?? {};
  const mediaType = content['application/json']
    ? 'application/json'
    : Object.keys(content)[0];
  const schema = mediaType ? content[mediaType]?.schema : undefined;
  if (!schema) return null;

  const tables = collectTables(schema, slug, 'Request');
  return {
    mediaType,
    required: Boolean(op?.requestBody?.required),
    // object 가 아니면(원시 타입) 표 대신 타입만 표기
    primitive: tables.length ? undefined : typeLabel(schema).label,
    tables,
    jsonHtml: highlightJson(JSON.stringify(sampleOf(schema), null, 2)),
  };
});

const tab = ref<'table' | 'json'>('table');
</script>

<template>
  <template v-if="body">
    <h2 class="oa-section-title">Request Body</h2>
    <p class="oa-body-meta">
      <code>{{ body.mediaType }}</code>
      <span v-if="body.required" class="oa-p-required">required</span>
    </p>

    <p v-if="!body.tables.length && body.primitive">
      타입: <code>{{ body.primitive }}</code>
    </p>

    <template v-if="body.tables.length">
      <div class="oa-tabs" role="tablist">
        <button
          type="button"
          class="oa-tab"
          :class="{ active: tab === 'table' }"
          @click="tab = 'table'"
        >
          Table
        </button>
        <button
          type="button"
          class="oa-tab"
          :class="{ active: tab === 'json' }"
          @click="tab = 'json'"
        >
          JSON
        </button>
      </div>

      <div v-show="tab === 'table'">
        <template v-for="t in body.tables" :key="t.id">
          <h4 :id="t.id">{{ t.title }}</h4>
          <table class="oa-params-table">
            <thead>
              <tr>
                <th>Field</th>
                <th>Type</th>
                <th>Required</th>
                <th>Constraints</th>
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
                  <!--
                    들여쓰기 대신 아이콘으로 깊이를 표시한다. 들여쓰기는 이름 컬럼을
                    계속 밀어내 3단쯤에서 이름이 잘리는데, 아이콘은 폭을 거의 안 먹는다.
                  -->
                  <span
                    class="oa-p-indent"
                    :style="{ paddingLeft: (row.depth > 1 ? row.depth - 1 : 0) * 1.25 + 'rem' }"
                  >
                    <span v-if="row.depth > 0" class="oa-p-branch">↳</span>
                    <code>{{ row.name }}</code>
                  </span>
                </td>
                <td class="oa-p-type">
                  <a v-if="row.ref" :href="`#${slug(row.ref)}`">{{ row.type }}</a>
                  <span v-else>{{ row.type }}</span>
                </td>
                <td class="oa-p-req">
                  <!-- 요청에서는 "보내야 한다" 는 의무다(응답의 "준다" 는 보증과 뜻이 다르다). -->
                  <span
                    v-if="row.required"
                    class="oa-p-required"
                    title="반드시 보내야 하는 필드입니다. 없으면 요청이 거부됩니다."
                    >required</span
                  >
                  <span
                    v-else
                    class="oa-p-optional"
                    title="생략할 수 있는 필드입니다."
                    >optional</span
                  >
                </td>
                <td class="oa-p-constraints">{{ row.constraints }}</td>
                <td class="oa-p-desc">{{ row.description }}</td>
              </tr>
            </tbody>
          </table>
        </template>
      </div>

      <div v-show="tab === 'json'">
        <pre class="oa-json"><code v-html="body.jsonHtml"></code></pre>
      </div>
    </template>
  </template>
</template>
