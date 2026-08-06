import { useMyCoords, type Coords } from '@/shared/hooks/useMyCoords';
import { useRegionControllerReverse } from '@/shared/api/generated/react/address/address';

export interface MyPlace {
  /** 좌표. 측위 전이면 없다. 거리순 조회에 그대로 실린다. */
  coords?: Coords;
  /** 사람이 읽는 지역("경기도 하남시"). 역지오코딩이 끝나야 채워진다. */
  label?: string;
  /** 측위 중(권한 창이 떠 있는 동안도 여기다). */
  locating: boolean;
  /** 브라우저가 이미 허용해 둔 상태. 이때만 조용히 측위해도 된다. */
  granted: boolean;
  /** 사용자가 거부했다. 다시 물어도 창이 안 뜬다 — 다른 길을 안내해야 한다. */
  denied: boolean;
  /** 측위. **명시적 행동에만 부른다**(허용된 경우 제외). */
  locate: () => void;
}

/**
 * 내 위치를 **좌표와 지역 이름 한 벌로** 준다.
 *
 * 둘을 같이 묶은 이유는 쓰는 자리가 하나이기 때문이다 — AI 가 "내 위치 기준" 이라고
 * 판단했을 때, 화면은 **어디인지 보여주고(label)** 동시에 **가까운 순으로 조회해야(coords)** 한다.
 * 따로 두면 훅 두 개가 각자 측위해 권한 창이 두 번 뜬다.
 *
 * 역지오코딩은 좌표가 생긴 뒤에만 돈다(`enabled`). react-query 가 좌표별로 캐시하므로
 * 같은 자리에서 여러 답변이 쌓여도 요청은 한 번이다.
 */
export function useMyPlace(): MyPlace {
  const { coords, status, granted, reason, locate } = useMyCoords();

  const { data: point } = useRegionControllerReverse(
    { lat: coords?.lat ?? 0, lon: coords?.lon ?? 0 },
    {
      query: {
        enabled: !!coords,
        // 좌표가 그대로면 지역도 그대로다. 창을 여닫을 때마다 다시 물을 이유가 없다.
        staleTime: Infinity,
      },
    },
  );

  return {
    coords,
    // 시군구가 없는 시도가 있다(세종). 그때는 시도만으로도 충분한 안내가 된다.
    label: point
      ? [point.sido.name, point.region?.name].filter(Boolean).join(' ')
      : undefined,
    locating: status === 'locating',
    granted,
    denied: reason === 'denied',
    locate: () => void locate(),
  };
}
