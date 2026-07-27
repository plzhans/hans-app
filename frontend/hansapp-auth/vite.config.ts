import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  console.log(
    `[vite] mode=${mode}  VITE_HANSAPI_BASE_URL=${process.env.VITE_HANSAPI_BASE_URL ?? '(not set)'}`,
  );
  // 단일 오리진 로컬(콘솔 5274 가 /auth 로 프록시)일 땐 VITE_BASE=/auth/ 로 자산 경로를 네임스페이스한다.
  // 배포(자기 서브도메인)는 루트. VITE_ROUTER_BASE 는 react-router basename 과 짝(App.tsx).
  const base = process.env.VITE_BASE ?? '/';
  return {
    base,
    plugins: [react()],
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
