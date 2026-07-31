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
    },
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
    server: {
      // 127.0.0.1 로 고정(콘솔·API 와 동일 호스트 → 쿠키 공유). localhost 로 새면 오리진 불일치로 SSO 가 깨진다.
      host: '127.0.0.1',
      // 로그인 포털 전용 포트(콘솔 5274, medifinder 5173 과 겹치지 않게 5273).
      port: 5273,
      strictPort: true,
      // 콘솔 프록시(/auth) 뒤에서 HTML/자산은 프록시로 오지만, HMR 웹소켓은 5273 로 직접 연결한다.
      hmr: { host: '127.0.0.1', port: 5273 },
    },
    build: { outDir: 'dist' },
  };
});
