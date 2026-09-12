import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getCurrentCoords,
  getGeoPermission,
  type GeoFailure,
} from '@/shared/lib/geolocation';

/**
 * "내 좌표" 한 번. **거리순 정렬처럼 좌표 자체가 필요한 기능만 쓴다.**
 *
 * 지역 코드를 원하면 [useMyRegion] 이다 — 그쪽은 좌표를 밖으로 내보내지 않고 시도·시군구만
 * 낸다. 여기는 반대로 좌표를 내주므로, **쓰는 쪽이 URL 에 싣지 않을 책임을 진다.**
 * 이 훅이 낸 값은 API 요청 파라미터로만 가고(격자로 뭉개서 — clinic/api.ts 의 snapToGrid),
 * 주소창·링크·로그에는 남지 않는다.
 *
 * **좌표를 오래 쥐고 있는다.** 정렬을 껐다 켤 때마다 다시 측위하면 그때마다 순위가 미세하게
 * 흔들리고 배터리도 먹는다 — 한 번 받은 값을 세션 동안 쓴다(움직이면서 검색하는 화면이 아니다).
 */

/** · idle 대기 · locating 측위 중 · ready 좌표 있음 · error 실패(reason 참고) */
export type MyCoordsStatus = 'idle' | 'locating' | 'ready' | 'error';

export interface Coords {
  lat: number;
  lon: number;
}

export interface UseMyCoords {
  status: MyCoordsStatus;

  /** status==='ready' 일 때만 채워진다. */
  coords?: Coords;

  /** status==='error' 일 때만 채워진다. 안내 문구를 고르는 데 쓴다. */
  reason?: GeoFailure;

  /**
   * 이 사이트가 위치를 **이미 쓸 수 있는가**(브라우저·OS 가 허용을 기억하고 있다).
   * 버튼에 불을 켜는 근거다. Permissions API 가 없는 브라우저에서는 늘 false 다(눌러봐야 안다).
   */
  granted: boolean;

  /** 측위. 이미 받아둔 좌표가 있으면 그걸 그대로 돌려준다(다시 재지 않는다). */
  locate: () => Promise<Coords | null>;
}

export function useMyCoords(): UseMyCoords {
  const [status, setStatus] = useState<MyCoordsStatus>('idle');
  const [coords, setCoords] = useState<Coords>();
  const [reason, setReason] = useState<GeoFailure>();
  const [granted, setGranted] = useState(false);

  /**
   * 최신 좌표를 ref 로도 쥔다. locate 를 의존성 없는 콜백으로 유지하려는 것이다 — coords 를
   * 의존성에 넣으면 좌표를 받는 순간 locate 의 정체성이 바뀌고, 그걸 effect 의존성에 쓴 쪽이
   * 곧바로 다시 부른다(무한 측위).
   */
  const cached = useRef<Coords | undefined>(undefined);

  // 프롬프트를 띄우지 않는 조회다. 마운트 때 한 번 봐서 버튼 표시를 미리 맞춰 둔다.
  useEffect(() => {
    let alive = true;
    void getGeoPermission().then((state) => {
      if (alive) setGranted(state === 'granted');
    });
    return () => {
      alive = false;
    };
  }, []);

  const locate = useCallback(async (): Promise<Coords | null> => {
    if (cached.current) return cached.current;

    setStatus('locating');
    setReason(undefined);

    const result = await getCurrentCoords();
    // 좌표를 받아냈다면 허용된 것이다. 마운트 때 'prompt' 였어도 여기서 켜진다.
    if (!result.ok) {
      setStatus('error');
      setReason(result.reason);
      return null;
    }

    const next = { lat: result.lat, lon: result.lon };
    cached.current = next;
    setCoords(next);
    setGranted(true);
    setStatus('ready');
    return next;
  }, []);

  return { status, coords, reason, granted, locate };
}
