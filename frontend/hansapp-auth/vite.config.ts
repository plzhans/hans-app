import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';
import path from 'path';

/**
 * Sentry release 로 쓸 산출물 신원. **숫자 버전만으로는 어느 커밋인지 모른다.**
 * sha 는 CI 가 넣어 준다(GitHub Actions 는 GITHUB_SHA). 로컬 빌드면 'dev' 가 박혀서,
 * 이게 배포 산출물이 아니라는 사실이 Sentry 에서 그대로 드러난다.
 */
const pkg = JSON.parse(
  readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'),
) as { version: string };
const gitSha = (process.env.VITE_GIT_SHA ?? process.env.GITHUB_SHA ?? 'dev')
  .trim()
  .slice(0, 7);

/*
  **이 산출물을 언제 구웠나.** 버전과 sha 만으로는 "지금 뜬 화면이 방금 올린 그것인가" 를
  못 가린다 — 같은 커밋을 두 번 배포하면 값이 똑같아서, 결국 커밋 시각을 뒤지게 된다.

  UTC(ISO)로 굽고 펴는 것은 화면이 한다(백엔드 build-info.json 의 builtAt 과 같은 방식).
  개발 서버로 띄우면 이 값은 **dev server 를 켠 시각**이다 — 파일을 고쳐도 갱신되지 않는다.
*/
const builtAt = new Date().toISOString();

export default defineConfig(({ mode }) => {
  console.log(
    `[vite] mode=${mode}  VITE_HANSAPP_BASE_URL=${process.env.VITE_HANSAPP_BASE_URL ?? '(not set)'}`,
  );
  // 단일 오리진 로컬(콘솔 5274 가 /auth 로 프록시)일 땐 VITE_BASE=/auth/ 로 자산 경로를 네임스페이스한다.
  // 배포(자기 서브도메인)는 루트. VITE_ROUTER_BASE 는 react-router basename 과 짝(App.tsx).
  //
  // **?? 가 아니라 || 다.** ?? 는 빈 문자열을 통과시키는데, vite 는 base:'' 를 **상대 경로**로
  // 해석해 BASE_URL 이 './' 가 된다. 그러면 `origin + BASE_URL + 'callback'` 이
  // 'https://호스트./callback' 이 되어 호스트 끝에 점이 붙는다 — 실제로 그렇게 깨졌다.
  // .env 에 키만 적고 값을 비워 두는 일이 있어서(누수 방지) 여기서 막는다.
  const base = process.env.VITE_BASE || '/';
  return {
    base,
    plugins: [react()],
    // 빌드 시점에 상수로 치환된다. Sentry release 문자열을 여기서 굳힌다.
    define: {
      __APP_RELEASE__: JSON.stringify(`${pkg.version}-${gitSha}`),
      __APP_BUILT_AT__: JSON.stringify(builtAt),
    },
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },

      /**
       * React 를 **한 벌만** 번들한다. @hansapp/legal 이 `link:` 로 붙어 있고 타입용으로 자기
       * node_modules 에 react 를 갖는다 — 그대로 두면 두 벌이 실리고, 나중에 그 패키지에 훅이
       * 들어가는 순간 "Invalid hook call" 로 터진다.
       */
      dedupe: ['react', 'react-dom'],
    },
    server: {
      // 127.0.0.1 로 고정(콘솔·API 와 동일 호스트 → 쿠키 공유). localhost 로 새면 오리진 불일치로 SSO 가 깨진다.
      host: '127.0.0.1',
      // 인증웹 전용 포트(콘솔 5274, medifinder 5173 과 겹치지 않게 5273).
      port: 5273,
      strictPort: true,
      // 콘솔 프록시(/auth) 뒤에서 HTML/자산은 프록시로 오지만, HMR 웹소켓은 5273 로 직접 연결한다.
      hmr: { host: '127.0.0.1', port: 5273 },
    },
    build: { outDir: 'dist' },
  };
});
