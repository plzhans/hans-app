import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  console.log(`[vite] mode=${mode}  VITE_HANSAPI_BASE_URL=${process.env.VITE_HANSAPI_BASE_URL ?? '(not set)'}`);
  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      host: true,

      /**
       * 포트를 못 박는다. 네이버 지도 키는 http://localhost:5173 **한 포트에만** 묶여 있어서,
       * vite 가 포트를 하나 밀어 5174 로 뜨면 지도가 인증 실패로 조용히 안 나온다.
       * 이미 5173 이 물려 있으면 다른 포트로 도망가지 말고 그냥 실패해라.
       */
      port: 5173,
      strictPort: true,
    },
    build: {
      outDir: 'dist',
    },
  };
});
