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
      // plzhans 인증 프론트 전용 포트(medifinder 5173 과 겹치지 않게 5273).
      port: 5273,
      strictPort: true,
    },
    build: { outDir: 'dist' },
  };
});
