/**
 * 위치 획득. **UI 를 모른다** — 좌표를 얻거나, 왜 못 얻었는지만 낸다.
 *
 * 좌표를 그대로 검색에 싣지는 않는다. 역지오코딩(/address/regions/reverse)으로 시도·시군구
 * 코드를 받아 지역 필터를 채우는 게 목적이다 — 그래야 사용자가 결과를 보고 고칠 수 있다.
 *
 * **웹·앱(Capacitor) 어느 쪽에서도 같은 코드로 돈다.** `navigator.geolocation` 은 네이티브
 * WebView 에도 있고, 권한 프롬프트는 Capacitor 가 OS 권한으로 연결해 준다.
 * 갈리는 건 '권한을 사용자가 직접 끄는 수단' 하나뿐이다 — 아래 openLocationSettings 참고.
 */

import { NativeSettings, AndroidSettings, IOSSettings } from 'capacitor-native-settings';

import { isNative } from './native';

/** 좌표 획득 결과. 실패 사유를 UI 가 구분해야 해서(안내 문구가 다르다) 판별 유니온으로 낸다. */
export type GeoResult =
  | { ok: true; lat: number; lon: number }
  | { ok: false; reason: GeoFailure };

/**
 * · denied      사용자가 거부했거나 브라우저·OS 가 막았다. 다시 물어도 프롬프트가 안 뜬다
 * · timeout     프롬프트를 띄웠는데 응답이 없다(방치). 다음에 누르면 다시 뜬다
 * · unavailable API 자체가 없거나 측위에 실패했다(위치 서비스 꺼짐 등)
 */
export type GeoFailure = 'denied' | 'timeout' | 'unavailable';

/**
 * 권한 팝업을 방치했을 때 빠져나오는 시간(ms).
 *
 * **`getCurrentPosition` 의 `timeout` 옵션으로는 이걸 못 한다** — 스펙상 그 값은 위치 획득
 * 시간에만 걸리고 **권한 응답을 기다리는 시간은 포함하지 않는다.** 팝업을 열어둔 채 두면
 * 콜백이 영영 안 와서 버튼이 계속 도는 상태가 된다. 그래서 자체 타이머로 감싼다.
 *
 * 사용자가 직접 누른 자리에서만 부르므로(팝업이 화면에 떠 있다) 짧게 자를 이유는 없다.
 */
const PROMPT_WAIT_MS = 10_000;

/** 권한을 받은 뒤 실제 측위에 허용하는 시간(ms). Wi-Fi 측위는 보통 1초 안쪽이다. */
const ACQUIRE_TIMEOUT_MS = 10_000;

/** 직전에 받아둔 위치를 재사용해도 되는 시간(ms). 5분 안이면 다시 재지 않는다. */
const MAX_AGE_MS = 5 * 60_000;

/** 앱 차원의 위치 사용 거부. 브라우저·OS 권한과 별개로 우리가 관리한다. */
const OPT_OUT_KEY = 'medifinder.geo.optOut';

/**
 * 사용자가 앱에서 위치 사용을 껐나.
 *
 * **브라우저 권한을 사이트가 취소할 방법이 없어서 두는 스위치다.** 표준에 그런 API 가 없고
 * (한때 있던 `Permissions.revoke()` 초안은 사라졌다), 권한 설정 화면으로 보내는 것도
 * 브라우저가 막아 뒀다. 권한을 지우지 못하면 **우리가 안 부르면 된다** — 사용자가 원하는
 * 결과(위치를 안 가져감)는 이걸로 다 얻어진다.
 */
export function isGeoOptedOut(): boolean {
  try {
    return localStorage.getItem(OPT_OUT_KEY) === '1';
  } catch {
    // 시크릿 모드·저장 차단 환경. 끈 적 없는 것으로 친다.
    return false;
  }
}

export function setGeoOptOut(optOut: boolean): void {
  try {
    if (optOut) localStorage.setItem(OPT_OUT_KEY, '1');
    else localStorage.removeItem(OPT_OUT_KEY);
  } catch {
    // 저장이 막혀도 이번 세션은 동작한다. 조용히 넘긴다.
  }
}

/**
 * OS 앱 설정 화면을 연다. 열었으면 true.
 *
 * **웹에서는 false 다.** 브라우저는 사이트가 권한 설정으로 보내는 것을 막아서
 * 안내(주소창 자물쇠 → 사이트 설정)밖에 방법이 없다. 호출부가 false 를 받으면 안내를 띄운다.
 *
 * 앱에서는 iOS·Android 모두 자기 앱의 설정 화면까지 데려다준다. 네이티브에서도 권한을
 * 코드로 취소하는 건 불가능하고, 이 방식이 양 OS 의 표준이다.
 */
export async function openLocationSettings(): Promise<boolean> {
  if (!isNative()) {
    return false;
  }
  await NativeSettings.open({
    optionAndroid: AndroidSettings.ApplicationDetails,
    optionIOS: IOSSettings.App,
  });
  return true;
}

/**
 * 프롬프트를 **띄우지 않고** 현재 권한 상태만 본다.
 *
 * `granted` 면 물어보지 않고 조용히 써도 된다는 뜻이고, `denied` 면 눌러봐야 프롬프트가
 * 안 뜨니 미리 안내를 바꿔 줄 수 있다. Permissions API 가 없는 브라우저면 null 이다.
 */
export async function getGeoPermission(): Promise<PermissionState | null> {
  if (!navigator.permissions?.query) {
    return null;
  }
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status.state;
  } catch {
    // 이름을 모르는 구현(구형 Safari)은 throw 한다. 모르는 것으로 친다.
    return null;
  }
}

/**
 * 현재 좌표. **거부·방치·실패를 예외로 던지지 않는다** — 위치는 부가 기능이라 호출한 쪽이
 * 조용히 물러날 수 있어야 한다.
 *
 * 정확도(`coords.accuracy`)는 보지 않는다. IP 폴백으로 수십 km 어긋난 좌표라도 그 광역권은
 * 맞으므로 지역을 고르는 데는 쓸 만하고, 결과(콤보박스에 찍힌 시도·시군구)를 사용자가 보고
 * 고칠 수 있다.
 */
export function getCurrentCoords(): Promise<GeoResult> {
  // 앱에서 껐으면 OS 권한이 살아 있어도 묻지 않는다. denied 로 내보내 호출부가 물러난다.
  if (isGeoOptedOut()) {
    return Promise.resolve({ ok: false, reason: 'denied' });
  }
  if (!('geolocation' in navigator)) {
    return Promise.resolve({ ok: false, reason: 'unavailable' });
  }

  return new Promise<GeoResult>((resolve) => {
    // 타이머가 먼저 끝난 뒤에 사용자가 뒤늦게 "허용" 을 누르면 성공 콜백이 그때 도착한다.
    // 이미 폴백한 뒤라 그 결과는 버린다 — 화면이 갑자기 바뀌는 게 더 놀랍다.
    let settled = false;
    const done = (result: GeoResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const timer = setTimeout(
      () => done({ ok: false, reason: 'timeout' }),
      PROMPT_WAIT_MS,
    );

    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timer);
        done({
          ok: true,
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        });
      },
      (error) => {
        clearTimeout(timer);
        done({
          ok: false,
          reason:
            error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable',
        });
      },
      {
        timeout: ACQUIRE_TIMEOUT_MS,
        maximumAge: MAX_AGE_MS,
      },
    );
  });
}
