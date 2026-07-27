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
      host: true,
      // 로그인 포털 전용 포트(콘솔 5274, medifinder 5173 과 겹치지 않게 5273).
      port: 5273,
      strictPort: true,
      // 콘솔 프록시(/auth) 뒤에서 HTML/자산은 프록시로 오지만, HMR 웹소켓은 5273 로 직접 연결한다.
      hmr: { host: 'localhost', port: 5273 },
    },
    build: { outDir: 'dist' },
  };
});
