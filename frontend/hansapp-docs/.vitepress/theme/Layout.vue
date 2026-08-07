<script setup lang="ts">
import DefaultTheme from 'vitepress/theme';
import Footer from './Footer.vue';

/*
  기본 레이아웃에 푸터만 얹는다.

  `layout-bottom` 을 쓰는 이유는 **사이드바 유무와 무관하게 그려지는 유일한 자리**라서다 —
  VitePress 기본 푸터(themeConfig.footer)는 사이드바가 있으면 감춰져서, 정작 문서
  페이지 전부에서 안 보인다.
*/
const { Layout } = DefaultTheme;
</script>

<template>
  <Layout>
    <template #layout-bottom>
      <Footer />
    </template>
  </Layout>
</template>
