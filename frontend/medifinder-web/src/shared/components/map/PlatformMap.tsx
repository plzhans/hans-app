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
}

/** 크게 보기 높이. 지도만 화면을 다 먹지 않도록 뷰포트의 70% 로 제한한다. */
const EXPANDED_HEIGHT = '70vh';

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
}: PlatformMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const renderedRef = useRef(false);
  const controllerRef = useRef<MapController | null>(null);

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
        controllerRef.current = adapter.create(mapRef.current, point);
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
