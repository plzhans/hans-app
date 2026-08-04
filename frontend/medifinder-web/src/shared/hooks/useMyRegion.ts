import { useCallback, useEffect, useState } from 'react';
import { regionControllerReverse } from '@/shared/api/generated/react/address/address';
import type { RegionPointDto } from '@/shared/api/generated/model';
import {
  getCurrentCoords,
  getGeoPermission,
  type GeoFailure,
} from '@/shared/lib/geolocation';

/**
 * "내 위치" 한 번 = 좌표 획득 → 역지오코딩 → 시도·시군구 코드.
 *
 * **좌표는 밖으로 내보내지 않는다.** 호출한 화면이 받는 건 지역 코드뿐이라, 좌표가 URL 이나
 * 검색 파라미터에 실릴 일이 없다 — 링크 공유·리퍼러로 위치가 새는 걸 구조로 막는다.
 * (지도 보기처럼 좌표 자체가 필요한 기능은 getCurrentCoords 를 직접 쓴다.)
 *
 * 권한은 **누르는 순간** 받는다. 화면이 열릴 때 미리 묻지 않는다 — 맥락 없는 프롬프트는
 * 거부율이 높고, 거부·방치가 쌓이면 브라우저가 그 사이트의 프롬프트를 아예 자동 차단한다.
 */

/** · idle 대기 · locating 좌표·지역 조회 중 · error 실패(reason 참고) */
export type MyRegionStatus = 'idle' | 'locating' | 'error';

/** 실패 사유. 위치 획득 실패(GeoFailure) + 지역 해석 실패(notFound). */
export type MyRegionFailure = GeoFailure | 'notFound';

export interface UseMyRegion {
  status: MyRegionStatus;

  /** status==='error' 일 때만 채워진다. 안내 문구를 고르는 데 쓴다. */
  reason?: MyRegionFailure;

  /**
   * 브라우저가 이미 거부를 기억하고 있는가. **버튼을 누르기 전에** 안다.
   * true 면 눌러도 프롬프트가 안 뜨므로 "브라우저 설정에서 허용해 달라" 로 안내가 바뀐다.
   * Permissions API 가 없는 브라우저에서는 늘 false 다(눌러봐야 안다).
   */
  blocked: boolean;

  /**
   * 이 사이트가 위치를 **이미 쓸 수 있는가**(브라우저·OS 가 허용을 기억하고 있다).
   *
   * 버튼에 불을 켜는 근거다 — 한 번 허용한 사람에게 매번 눌러야 켜지는 표시는 "지금 위치가
   * 공유되고 있는가" 에 답하지 못한다. 여기서 켜져 있다고 좌표를 미리 받아오지는 않는다.
   * Permissions API 가 없는 브라우저에서는 늘 false 다(눌러봐야 안다).
   */
  granted: boolean;

  /** 실행. 성공하면 지역, 실패하면 null 이다(사유는 reason 으로 남는다). */
  locate: () => Promise<RegionPointDto | null>;
}

export function useMyRegion(): UseMyRegion {
  const [status, setStatus] = useState<MyRegionStatus>('idle');
  const [reason, setReason] = useState<MyRegionFailure>();
  const [blocked, setBlocked] = useState(false);
  const [granted, setGranted] = useState(false);

  // 프롬프트를 띄우지 않는 조회다. 마운트 때 한 번 봐서 버튼 안내를 미리 맞춰 둔다.
  useEffect(() => {
    let alive = true;
    void getGeoPermission().then((state) => {
      if (!alive) return;
      setBlocked(state === 'denied');
      setGranted(state === 'granted');
    });
    return () => {
      alive = false;
    };
  }, []);

  const locate = useCallback(async (): Promise<RegionPointDto | null> => {
    setStatus('locating');
    setReason(undefined);

    const coords = await getCurrentCoords();
    // 좌표를 받아냈다면 허용된 것이다. 마운트 때 'prompt' 였어도 여기서 켜진다.
    if (coords.ok) setGranted(true);
    if (!coords.ok) {
      // 이번에 거부했다면 다음부터는 프롬프트가 안 뜬다 — 안내를 바로 바꿔 둔다.
      if (coords.reason === 'denied') setBlocked(true);
      setStatus('error');
      setReason(coords.reason);
      return null;
    }

    try {
      const point = await regionControllerReverse({
        lat: coords.lat,
        lon: coords.lon,
      });
      setStatus('idle');
      return point;
    } catch {
      // 한국 밖이거나 주변에 병원이 없으면 404 다. 오류가 아니라 "못 알아냈다" 로 다룬다.
      setStatus('error');
      setReason('notFound');
      return null;
    }
  }, []);

  return { status, reason, blocked, granted, locate };
}
