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
  console.log(`[vite] mode=${mode}  VITE_HANSAPP_BASE_URL=${process.env.VITE_HANSAPP_BASE_URL ?? '(not set)'}`);
  return {
    plugins: [react()],
    // 빌드 시점에 상수로 치환된다. Sentry release 문자열을 여기서 굳힌다.
    define: {
      __APP_RELEASE__: JSON.stringify(`${pkg.version}-${gitSha}`),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },

      /**
       * Capacitor core 를 **한 벌만** 번들한다.
       *
       * auth-sdk 가 `link:` 로 붙어 있고 자기 node_modules 에 @capacitor/core 를 따로 갖는다.
       * 그대로 두면 auth-sdk(Preferences)와 앱(Geolocation·NativeSettings)이 **서로 다른
       * core 인스턴스**를 잡는다. 플러그인 레지스트리가 core 모듈의 전역 상태라, 갈라지면
       * 한쪽이 네이티브 구현을 못 찾고 조용히 웹 폴백으로 떨어진다 — 앱에서만 재현되는
       * 종류의 버그다.
       *
       * 지금은 auth 코드가 아직 어디서도 안 불려 번들에 없지만, 붙는 순간 문제가 된다.
       */
      dedupe: ['@capacitor/core'],
    },
    server: {
      /*
        **127.0.0.1 로 고정한다.** host:true(0.0.0.0)로 두면 vite 가 Local 주소를
        `http://localhost:5173` 으로 찍는데, 그 주소로 열면 API·인증웹(127.0.0.1)과 **다른
        호스트**가 되어 쿠키가 흐르지 않고 클라이언트 등록 오리진과도 어긋난다.
        브라우저 주소창에 무엇이 뜨느냐가 곧 오리진이라, 찍히는 주소부터 맞춰 둔다.

        LAN 의 다른 기기(휴대폰)에서 열어 봐야 할 때는 이 줄을 잠시 `true` 로 돌린다 —
        그때는 네이버 지도 키와 클라이언트 등록 오리진이 그 주소를 모른다는 점을 감안할 것.
      */
      host: '127.0.0.1',

      /**
       * 포트를 못 박는다. 네이버 지도 키는 http://127.0.0.1:5173 **한 포트에만** 묶여 있어서,
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
