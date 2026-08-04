import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor 설정. **아직 네이티브 플랫폼(ios/·android/)은 만들지 않았다.**
 *
 * 웹 쪽 준비만 먼저 해 둔 상태다 — 플러그인이 깔려 있고 브리지 코드가 붙어 있어서,
 * 앱을 낼 시점에 `npx cap add ios` / `npx cap add android` 만 하면 된다.
 * 그때 Xcode·Android Studio 가 필요하고 생성물이 커서 지금 만들지 않았다.
 *
 * [웹에서도 그대로 돈다]
 * Capacitor 플러그인은 브라우저에서 웹 구현으로 떨어진다(Preferences → localStorage 등).
 * 그래서 이 설정이 있다고 웹 빌드가 달라지지 않는다. 분기는 코드에 두지 않는다 —
 * 플랫폼 판정이 필요한 자리는 shared/lib/native.ts 한 곳뿐이다.
 */
const config: CapacitorConfig = {
  // 역DNS. 서비스 도메인(medifinder.kr)을 뒤집은 것이다.
  // **한 번 스토어에 올리면 바꿀 수 없다.** iOS 번들 ID·Android 패키지명이 이 값이 된다.
  appId: 'kr.medifinder.app',
  appName: 'MediFinder',

  // vite build 산출물. package.json 의 build 스크립트와 맞춰야 한다.
  webDir: 'dist',
};

export default config;
