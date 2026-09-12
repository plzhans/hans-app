import { Capacitor } from '@capacitor/core';

/**
 * 플랫폼 판정. **분기가 필요한 자리는 여기 하나로 모은다.**
 *
 * Capacitor 플러그인 대부분은 브라우저에서 웹 구현으로 떨어지므로(Preferences → localStorage)
 * 호출부가 플랫폼을 알 필요가 없다. 알아야 하는 건 **웹이 아예 못 하는 일**뿐이고,
 * 지금은 그게 '앱 설정 화면 열기' 하나다.
 */

/** 네이티브 셸(iOS·Android) 안에서 도는가. 브라우저면 false. */
export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/** 'ios' | 'android' | 'web' */
export function platform(): string {
  return Capacitor.getPlatform();
}
