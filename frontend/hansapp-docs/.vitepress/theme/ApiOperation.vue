<script setup lang="ts">
import { computed } from 'vue';
import { useData } from 'vitepress';

// 한 오퍼레이션을 렌더한다. 태그 페이지([tag].md)에서 오퍼레이션마다 하나씩 사용한다.
// OAOperation 의 parameters/request-body/responses 슬롯을 우리 표 컴포넌트로 교체한다.
// (OAOperation, ParamsTable, RequestBodyTable, ResponsesTable 은 theme 에서 전역 등록됨)
declare const __OPENAPI_SPEC__: Record<string, any>;

const props = defineProps<{ operationId: string }>();
const { isDark } = useData();

/*
  **Request 블록(엔드포인트·메서드·인증 안내)을 어느 슬롯에서 그릴지 정한다.**

  OAOperation 은 내용이 있는 섹션만 렌더한다 — 파라미터가 없으면 `parameters` 슬롯을,
  security 가 없으면 `security` 슬롯을 아예 부르지 않는다. 그래서 슬롯 하나에만 걸어 두면
  본문만 받는 POST(/healthcare/ai-search)나 인자·인증이 모두 없는 엔드포인트
  (/oauth/token)에서 Request 블록이 통째로 사라졌다.

  그래서 **그 오퍼레이션에서 실제로 렌더되는 첫 슬롯**에 건다. 순서는 화면에 그려지는
  순서와 같아서, 어디에 걸리든 설명 바로 아래에 온다.
*/
const op = computed(() => {
  for (const pathItem of Object.values(__OPENAPI_SPEC__?.paths ?? {})) {
    for (const o of Object.values(pathItem as Record<string, any>)) {
      if (o && typeof o === 'object' && o.operationId === props.operationId) {
        return o;
      }
    }
  }
  return null;
});

/** Request 블록을 그릴 자리. 위에서부터 렌더되는 첫 슬롯을 고른다. */
const slot = computed<'parameters' | 'security' | 'request-body' | 'responses'>(
  () => {
    const o = op.value;
    if ((o?.parameters ?? []).length) return 'parameters';
    if ((o?.security ?? []).length) return 'security';
    if (o?.requestBody) return 'request-body';
    // 셋 다 없으면 남는 것은 responses 뿐이다(응답 없는 오퍼레이션은 없다).
    return 'responses';
  },
);
</script>

<template>
  <OAOperation :operationId="operationId" :isDark="isDark">
    <!-- 기본 Authorizations 섹션은 감춘다. 인증 안내는 Request 블록 안에서 한다. -->
    <template #security>
      <ParamsTable v-if="slot === 'security'" :operationId="operationId" />
      <span v-else style="display: none" />
    </template>
    <template #parameters>
      <ParamsTable :operationId="operationId" />
    </template>
    <template #request-body>
      <ParamsTable v-if="slot === 'request-body'" :operationId="operationId" />
      <RequestBodyTable :operationId="operationId" />
    </template>
    <template #responses>
      <ParamsTable v-if="slot === 'responses'" :operationId="operationId" />
      <ResponsesTable :operationId="operationId" />
    </template>
  </OAOperation>
</template>
