<script setup lang="ts">
import { computed, reactive } from 'vue';
import {
  collectTables,
  findOp,
  highlightJson,
  sampleOf,
  typeLabel,
} from './openapi-schema';

// operationId 로 스펙에서 응답(responses)의 스키마를 읽어 "모델별 표"로 렌더한다.
// 중첩 스키마($ref)는 각각 별도 표로 그리고, 타입 셀에서 해당 표로 앵커 링크한다.
// 스키마를 읽고 표로 펴는 규칙은 요청 본문과 공유한다(./openapi-schema).

const props = defineProps<{ operationId: string }>();

// 한 페이지에 여러 오퍼레이션이 올 수 있으므로 operationId 로 스코프를 준다(앵커 id 충돌 방지).
function slug(name: string): string {
  return `schema-${props.operationId}-${name}`.toLowerCase();
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
    const tables = collectTables(schema, slug, 'Response');
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
                <td class="oa-p-constraints">{{ row.constraints }}</td>
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
