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
      host: true,
      // 콘솔 전용 포트(포털 hansapp-auth 5273, medifinder 5173 과 겹치지 않게 5274).
      port: 5274,
      strictPort: true,
    },
    build: { outDir: 'dist' },
  };
});
