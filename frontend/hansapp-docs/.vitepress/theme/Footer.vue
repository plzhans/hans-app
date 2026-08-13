<script setup lang="ts">
import { ref } from 'vue';

/*
  하단 고지. **hansapp-web 의 Footer 와 같은 구성이다** — 같은 운영 주체의 사이트라
  문서만 다른 고지를 달고 있으면 남의 사이트처럼 보인다.

  **VitePress 기본 푸터(themeConfig.footer)로는 안 된다.** 그쪽은 사이드바가 있는
  페이지에서 `display: none` 이라, 정작 문서 페이지 전부에서 안 보인다.
  그래서 레이아웃의 `layout-bottom` 슬롯에 직접 넣는다(Layout.vue).

  **개인정보처리방침만 굵게 둔다.** 취향이 아니라 요건이다 — 개인정보 보호법은 처리방침을
  다른 고지사항과 구분해 표시하도록 요구한다.

  링크는 절대 주소다. 약관·방침은 포털(plzhans.com)이 들고 있고 여기는 다른 호스트다.
*/
declare const __APP_ENV__: string;
declare const __APP_RELEASE__: string;
declare const __APP_BUILT_AT__: string;
declare const __CONTACT_EMAIL__: string;

/*
  **주입값(vite define)은 스크립트에서 한 번 받아 둔다.** 템플릿에 `__CONTACT_EMAIL__` 을
  그대로 쓰면 치환되지 않는다 — 템플릿은 렌더 함수로 먼저 컴파일되면서 식별자가
  컴포넌트 스코프 참조로 바뀌고, define 은 그걸 못 알아본다(값이 빈 칸으로 나간다).
*/
const appEnv = __APP_ENV__;
const appRelease = __APP_RELEASE__;
const appBuiltAt = __APP_BUILT_AT__;
const contactEmail = __CONTACT_EMAIL__;

/**
 * 구운 시각을 `20260813_2324` 로. **KST 고정이다**(다른 앱의 buildStamp 와 같은 규칙).
 *
 * 이 값은 산출물의 속성이지 보는 사람이 겪은 사건이 아니다 — 배포를 이야기할 때 쓰는 시각이
 * 한국 시간 하나뿐이라, 보는 사람마다 다르게 펴지면 "몇 시 배포본이냐" 를 맞춰 볼 수 없다.
 * 쓰는 시간대가 하나뿐이라 화면에 `KST` 는 적지 않는다.
 */
function formatBuildStamp(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '—';
  // en-CA 는 `2026-08-13, 23:24` 로 준다 — 어느 브라우저에서도 ISO 순서라 자르기만 하면 된다.
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(at);
  const [date, time] = formatted.split(', ');
  if (!date || !time) return '—';
  // 자정을 24시로 주는 런타임이 있다.
  return `${date.replace(/-/g, '')}_${time.replace(/^24:/, '00:').replace(':', '')}`;
}

const buildStamp = formatBuildStamp(appBuiltAt);

const PORTAL = 'https://plzhans.com';

/** 연속 클릭으로 인정할 간격. 이보다 뜸하면 처음부터 다시 센다. */
const REVEAL_CLICK_GAP_MS = 1500;
/** 몇 번 눌러야 열리나. */
const REVEAL_CLICKS = 5;

/*
  저작권 표시를 **다섯 번 연달아 누르면 산출물 버전이 나온다**(web 과 같은 동작).

  버전을 늘 띄워 두지 않는 건 사용자에게 의미가 없어서고, 그렇다고 볼 방법이 없으면
  "지금 배포된 게 뭔지" 확인하려고 매번 개발자도구를 열어야 한다.

  버튼으로 만들지 않는다. role 을 붙이는 순간 스크린 리더와 탭 순서에 드러나서
  숨겨 둔 의미가 없어진다.
*/
const shown = ref(false);
let clicks = 0;
let lastClickAt = 0;

function onCopyrightClick() {
  const now = Date.now();
  clicks = now - lastClickAt > REVEAL_CLICK_GAP_MS ? 1 : clicks + 1;
  lastClickAt = now;
  if (clicks >= REVEAL_CLICKS) {
    clicks = 0;
    // 다시 다섯 번 누르면 닫힌다.
    shown.value = !shown.value;
  }
}
</script>

<template>
  <footer class="hans-footer">
    <div class="hans-footer-inner">
      <!-- 왼쪽 브랜드, 오른쪽 링크. 좁으면 링크가 다음 줄로 내려간다. -->
      <div class="hans-footer-row">
        <p>
          <span class="hans-footer-brand">HansApp</span>
          <span class="hans-footer-tagline">직접 만든 서비스들을 한 곳에서</span>
        </p>

        <nav class="hans-footer-links">
          <a :href="`${PORTAL}/terms`">이용약관</a>
          <span aria-hidden class="hans-footer-dot">·</span>
          <a :href="`${PORTAL}/privacy`" class="hans-footer-privacy"
            >개인정보처리방침</a
          >
        </nav>
      </div>

      <!-- 운영 주체와 문의는 한 묶음이다. -->
      <div class="hans-footer-row hans-footer-row--sub">
        <p class="hans-footer-operator">
          <span>개인이 운영하는 서비스입니다.</span>
          <span>
            문의:
            <a :href="`mailto:${contactEmail}`">{{ contactEmail }}</a>
          </span>
        </p>

        <p class="hans-footer-copyright">
          <!-- 다섯 번 누르는 동안 글자가 블록으로 잡히지 않게 select 를 막는다. -->
          <span class="hans-footer-mark" @click="onCopyrightClick">
            © 2026 plzhans.com
          </span>
          <!-- 환경 · 버전 · 구운 시각 순. 앞에서부터 좁혀 읽힌다(web·auth 푸터와 같다). -->
          <span v-if="shown" class="hans-footer-version" :title="appBuiltAt">
            {{ appEnv }} · v{{ appRelease }} {{ buildStamp }}
          </span>
        </p>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.hans-footer {
  border-top: 1px solid var(--vp-c-gutter);
  background-color: var(--vp-c-bg);
}

/*
  **사이드바가 푸터를 덮는다.** 사이드바는 position: fixed 라 문서 흐름에서 빠져 있는데
  푸터는 layout-bottom 슬롯이라 화면 전체 폭을 쓴다. 그래서 왼쪽이 가려졌다.

  본문(.VPContent.has-sidebar)이 쓰는 여백 규칙을 **그대로** 따라간다. 숫자를 새로 정하면
  VitePress 가 레이아웃을 바꿀 때 둘이 어긋나고, 그건 화면을 봐야만 드러난다.

  사이드바가 없는 페이지(404)에는 has-sidebar 가 붙지 않아 저절로 빠진다 —
  그 페이지까지 밀어 넣으면 왼쪽이 텅 빈 채로 들여쓰기만 남는다.
*/
@media (min-width: 960px) {
  .VPContent.has-sidebar ~ .hans-footer {
    padding-left: var(--vp-sidebar-width);
  }
}

@media (min-width: 1440px) {
  .VPContent.has-sidebar ~ .hans-footer {
    padding-right: calc((100vw - var(--vp-layout-max-width)) / 2);
    padding-left: calc(
      (100vw - var(--vp-layout-max-width)) / 2 + var(--vp-sidebar-width)
    );
  }
}

.hans-footer-inner {
  max-width: 1152px;
  margin: 0 auto;
  padding: 24px 24px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--vp-c-text-3);
}

.hans-footer-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 4px 24px;
}

.hans-footer-row--sub {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--vp-c-divider);
}

.hans-footer-brand {
  font-weight: 700;
  color: var(--vp-c-text-2);
}

.hans-footer-tagline {
  margin-left: 8px;
}

.hans-footer-links {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 12px;
}

.hans-footer-links a {
  color: var(--vp-c-text-2);
  text-decoration: none;
  transition: color 0.25s;
}

/* 밑줄은 올렸을 때만. 본문 링크와 규칙을 맞춘다(custom.css). */
.hans-footer-links a:hover,
.hans-footer-operator a:hover {
  color: var(--vp-c-text-1);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.hans-footer-privacy {
  font-weight: 700;
}

.hans-footer-dot {
  color: var(--vp-c-divider);
}

.hans-footer-operator {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
}

.hans-footer-operator a {
  color: var(--vp-c-text-2);
  transition: color 0.25s;
}

.hans-footer-copyright {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;
}

.hans-footer-mark {
  cursor: default;
  user-select: none;
}

.hans-footer-version {
  font-family: var(--vp-font-family-mono);
  color: var(--vp-c-text-2);
}
</style>
