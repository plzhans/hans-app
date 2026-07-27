import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  console.log(
    `[vite] mode=${mode}  VITE_HANSAPI_BASE_URL=${process.env.VITE_HANSAPI_BASE_URL ?? '(not set)'}`,
  );
  return {
    plugins: [react()],
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
    server: {
      // 127.0.0.1 로 고정한다(localhost 로 새지 않게). API 가 127.0.0.1:3000 이라, 쿠키(호스트 기준)가
      // 프론트↔API 사이에 흐르려면 프론트도 같은 호스트여야 한다. localhost 와 127.0.0.1 은 서로 다른 호스트다.
      host: '127.0.0.1',
      // 콘솔 전용 포트(포털 hansapp-auth 5273, medifinder 5173 과 겹치지 않게 5274).
      port: 5274,
      strictPort: true,
      // 단일 오리진 로컬: 이 콘솔(hans-app)이 front door. /auth/* 는 로그인 포털(hansapp-auth 5273)로 프록시.
      //   http://127.0.0.1:5274/           → 콘솔
      //   http://127.0.0.1:5274/auth/login → 포털 (base=/auth/)
      proxy: {
        '/auth': { target: 'http://127.0.0.1:5273', changeOrigin: true },
      },
    },
    build: { outDir: 'dist' },
  };
});
