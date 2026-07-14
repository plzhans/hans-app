<script setup lang="ts">
import { useData } from 'vitepress';

// 한 오퍼레이션을 렌더한다. 태그 페이지([tag].md)에서 오퍼레이션마다 하나씩 사용한다.
// OAOperation 의 parameters/responses 슬롯을 우리 표 컴포넌트로 교체한다.
// (OAOperation, ParamsTable, ResponsesTable 은 theme 에서 전역 등록됨)
defineProps<{ operationId: string }>();
const { isDark } = useData();
</script>

<template>
  <OAOperation :operationId="operationId" :isDark="isDark">
    <!-- 기본 인증(Authorizations) 섹션은 숨기고, 인증 안내는 Request(ParamsTable) 안에서 표시한다. -->
    <template #security><span style="display: none" /></template>
    <template #parameters>
      <ParamsTable :operationId="operationId" />
    </template>
    <template #responses>
      <ResponsesTable :operationId="operationId" />
    </template>
  </OAOperation>
</template>
