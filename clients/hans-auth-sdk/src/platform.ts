import { webStorage, type PlatformStorage } from './persistence.js';

export type { PlatformStorage, StateStore } from './persistence.js';
export { webStorage } from './persistence.js';

/**
 * Capacitor 네이티브 컨테이너 안에서 도는지.
 *
 * @capacitor/core 를 import 하지 않는다 — 네이티브 브리지가 window.Capacitor 를 심어 두므로
 * 전역만 들여다보면 된다. 의존성 없이 확인하려고 이렇게 한다.
 */
function isNativeContainer(): boolean {
  const capacitor = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  try {
    return capacitor?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

/**
 * 쓸 저장소를 정한다. 안 주면 웹 표준 구현이다.
 *
 * 네이티브인데 어댑터가 없으면 경고한다. 그냥 두면 웹뷰의 localStorage 로 조용히 떨어지는데,
 * 그건 앱 데이터가 비워질 때 로그인이 함께 날아간다는 뜻이다 — 개발 중에는 멀쩡해 보이고
 * 사용자 기기에서 뒤늦게 드러나는 종류라 여기서 시끄럽게 알린다.
 */
export function resolveStorage(storage?: PlatformStorage): PlatformStorage {
  if (storage) return storage;
  if (isNativeContainer()) {
    console.warn(
      '[hans-auth-sdk] 네이티브에서 도는데 storage 어댑터가 없어 웹 저장소를 쓴다. ' +
        "@hans-api/auth-sdk/capacitor 의 capacitorStorage 를 createAuthClient 의 storage 에 넘길 것.",
    );
  }
  return webStorage;
}
