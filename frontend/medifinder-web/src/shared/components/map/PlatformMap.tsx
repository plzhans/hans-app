import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Crosshair, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import {
  MapError,
  type MapController,
  type MapPoint,
  type PlatformAdapter,
} from './mapAdapters';

interface PlatformMapProps {
  adapter: PlatformAdapter;
  point: MapPoint;
  height?: string;
  /** 바깥에서 테두리·모서리를 씌우는 경우(탭과 한 프레임). 자체 테두리를 끈다. */
  bare?: boolean;
  /**
   * 지금 화면에 보이는 지도인지. 부모가 여러 플랫폼을 마운트해두고 display 로만 전환하므로,
   * 숨겼다 다시 보일 때 컨테이너 크기가 복원된다 — 그때 refresh() 로 다시 그려야 안 잘린다.
   */
  visible?: boolean;
  /**
   * 곁들임 핀(근처의 비슷한 병원). 있으면 회색으로 함께 찍고, 다 들어오게 확대율을 맞춘다.
   *
   * **배열 정체성이 안정적이어야 한다** — 렌더마다 새 배열을 넘기면 그때마다 핀을 다시 만든다.
   * 부모가 useMemo 로 묶어서 넘긴다.
   */
  nearby?: MapPoint[];
}

/** 크게 보기 높이. 지도만 화면을 다 먹지 않도록 뷰포트의 70% 로 제한한다. */
const EXPANDED_HEIGHT = '70vh';

/** 곁들임 핀 기본값. 모듈 상수라 정체성이 고정된다 — 매번 [] 을 만들면 효과가 헛돈다. */
const EMPTY_NEARBY: MapPoint[] = [];

/**
 * 지도 한 장의 공용 껍데기.
 *
 * SDK 별 차이(로딩·지도·마커)는 adapter 가 감춘다. 여기선 컨테이너, 크게보기/현위치 버튼,
 * 키 미설정·로드 실패 안내처럼 **플랫폼과 무관한 것**만 그린다. 그래서 세 플랫폼의 UX 가 같다.
 *
 * 부모(MapView)가 플랫폼마다 `key` 를 달아 렌더하므로, 탭을 바꾸면 이 컴포넌트가 통째로
 * 새로 마운트된다 — 이전 지도는 사라지고, 고른 플랫폼의 SDK 만 그때 로드된다(비용 절약).
 */
export function PlatformMap({
  adapter,
  point,
  height = '312px',
  bare = false,
  visible = true,
  nearby = EMPTY_NEARBY,
}: PlatformMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const renderedRef = useRef(false);
  const controllerRef = useRef<MapController | null>(null);
  // 지도 생성이 끝나는 시점에 최신 목록을 얹어야 한다 — 생성은 비동기(SDK 로드)라
  // 그 사이 목록이 바뀌었을 수 있고, 클로저에 갇힌 옛 값을 쓰면 핀이 어긋난다.
  const nearbyRef = useRef(nearby);
  nearbyRef.current = nearby;

  const { t } = useTranslation();
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!adapter.key) return;

    let cancelled = false;
    adapter
      .load()
      .then(() => {
        if (cancelled || !mapRef.current || renderedRef.current) return;
        renderedRef.current = true;
        const controller = adapter.create(mapRef.current, point);
        controllerRef.current = controller;
        controller.setNearby(nearbyRef.current);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setErrorKey(e instanceof MapError ? e.i18nKey : 'map.loadFailed');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [adapter, point.lat, point.lng, point.name]);

  /**
   * 목록이 지도보다 늦게 오거나 도중에 바뀌면 핀만 갈아 끼운다.
   * **지도를 다시 만들지 않는다** — 인스턴스 생성이 과금 단위다.
   * 최초 생성 때는 위 훅이 이미 얹었으므로 여기서는 이미 그려진 지도만 손댄다.
   */
  useEffect(() => {
    if (renderedRef.current) controllerRef.current?.setNearby(nearby);
  }, [nearby]);

  /**
   * 숨김(display:none) → 보임으로 돌아오면 컨테이너가 0 크기였다가 복원된다.
   * SDK 는 생성 시점 크기로 타일을 그려서, 그대로 두면 지도가 잘리거나 회색 여백이 남는다.
   * 이미 생성된 지도만(renderedRef) 다시 그린다. 최초 마운트 때는 위 load 훅이 그린다.
   */
  useEffect(() => {
    if (visible && renderedRef.current) controllerRef.current?.refresh();
  }, [visible]);

  if (!adapter.key) {
    return (
      <div
        className={cn(
          'bg-slate-50 p-4 text-center text-sm text-slate-500',
          !bare && 'rounded-2xl border border-slate-200',
        )}
      >
        {t('map.noKey')}
      </div>
    );
  }

  if (errorKey) {
    return (
      <div
        className={cn(
          'bg-amber-50 p-4 text-center text-sm text-amber-700',
          !bare && 'rounded-2xl border border-amber-200',
        )}
      >
        {t(errorKey)}
      </div>
    );
  }

  /**
   * 지도를 키우거나 줄인다.
   *
   * **크기를 바꾼 뒤 refresh() 를 불러야 한다.** 지도 SDK 는 생성 시점의 컨테이너 크기로 타일을
   * 그려서, 컨테이너만 커지면 지도가 잘린 채 회색 여백이 생긴다. CSS 전환(300ms)이 끝난 뒤 잰다.
   */
  const toggleSize = () => {
    setExpanded((prev) => !prev);
    window.setTimeout(() => controllerRef.current?.refresh(), 320);
  };

  return (
    <div className="relative">
      <div
        ref={mapRef}
        className={cn(
          'w-full overflow-hidden transition-[height] duration-300',
          !bare && 'rounded-2xl border border-slate-200',
        )}
        style={{ height: expanded ? EXPANDED_HEIGHT : height }}
      />

      {/* 지도 위에 겹친다. 확대/축소 버튼은 오른쪽 위에 있으므로 왼쪽 위를 쓴다. */}
      <div className="absolute left-3 top-3 flex flex-col gap-1.5">
        <button
          type="button"
          onClick={toggleSize}
          title={expanded ? t('map.collapse') : t('map.expand')}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/95 text-slate-600 shadow-md ring-1 ring-slate-200 backdrop-blur transition-colors hover:text-primary-600"
        >
          {expanded ? (
            <Minimize2 className="h-4 w-4" />
          ) : (
            <Maximize2 className="h-4 w-4" />
          )}
        </button>

        <button
          type="button"
          onClick={() => controllerRef.current?.recenter()}
          title={t('map.recenter')}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/95 text-slate-600 shadow-md ring-1 ring-slate-200 backdrop-blur transition-colors hover:text-primary-600"
        >
          <Crosshair className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
