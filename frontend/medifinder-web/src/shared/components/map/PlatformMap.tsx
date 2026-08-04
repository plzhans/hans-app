import { useCallback, useEffect, useRef, useState } from 'react';
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
  /**
   * 기준 병원 핀을 그릴지. **검색 결과 지도에는 기준이 없다** — 가운데에 아무 뜻 없는
   * 회색 점이 남으므로 끈다. 상세(이 병원 주변)에서는 기본값 그대로 그린다.
   */
  anchor?: boolean;
  /** 말풍선을 눌렀을 때. MapPoint.id 를 그대로 돌려준다 — 무엇을 할지는 화면이 정한다. */
  onSelect?: (id: string) => void;
}

/** 크게 보기 높이. 지도만 화면을 다 먹지 않도록 뷰포트의 70% 로 제한한다. */
const EXPANDED_HEIGHT = '70vh';

/**
 * 지도가 실제로 그려졌는지 확인하기까지 기다리는 시간(ms).
 * SDK 가 타일을 처음 붙일 만큼은 주되, 실패했을 때 빈 상자를 오래 보여주지 않을 만큼 짧게.
 */
const RENDER_CHECK_MS = 4000;

/** 크기가 멈췄다고 보기까지 기다리는 시간(ms). 높이 전환(300ms)보다 짧아도 마지막 것만 남는다. */
const RESIZE_SETTLE_MS = 120;

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
  anchor = true,
  onSelect,
}: PlatformMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const renderedRef = useRef(false);
  const controllerRef = useRef<MapController | null>(null);
  // 지도 생성이 끝나는 시점에 최신 목록을 얹어야 한다 — 생성은 비동기(SDK 로드)라
  // 그 사이 목록이 바뀌었을 수 있고, 클로저에 갇힌 옛 값을 쓰면 핀이 어긋난다.
  const nearbyRef = useRef(nearby);
  nearbyRef.current = nearby;

  /**
   * **콜백을 ref 로 붙잡아 안정된 함수 하나만 어댑터에 넘긴다.**
   *
   * 부모는 보통 `onSelect={(id) => …}` 처럼 렌더마다 새 함수를 만든다. 그걸 그대로 넘기면
   * setNearby 의 의존성이 매 렌더 바뀌어 **핀을 통째로 다시 만든다** — 마커 생성은 SDK
   * 호출이라 그만큼 값이 나가고, 열려 있던 말풍선도 매번 닫힌다.
   */
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const selectPoint = useCallback((id: string) => onSelectRef.current?.(id), []);

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
        controller.setNearby(nearbyRef.current, { anchor, onSelect: selectPoint });

        /*
          **그려졌는지 확인한다.** 카카오는 인증에 실패해도(키가 틀리거나 이 도메인이 등록돼
          있지 않거나 한도를 넘겨도) 스크립트는 200 으로 받아지고 create() 도 조용히 지나간다 —
          오류는 콘솔에만 찍히고 화면에는 **빈 상자**만 남는다. 네이버는 authFailure 훅이,
          구글은 콜백 미호출이 알려주는데 카카오만 그 통로가 없다.

          그래서 결과를 본다: SDK 는 컨테이너 안에 타일·캔버스를 채워 넣으므로, 잠시 뒤에도
          비어 있으면 실패한 것이다. 원인까지는 알 수 없으니 일반 실패로 알린다 —
          빈 상자를 보여주는 것보다 "못 불러왔다" 고 말하는 편이 낫다.
        */
        window.setTimeout(() => {
          if (cancelled) return;
          if (mapRef.current && mapRef.current.childElementCount === 0) {
            setErrorKey('map.loadFailed');
          }
        }, RENDER_CHECK_MS);
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
   * **컨테이너 크기가 바뀌면 지도에게 다시 그리라고 한다.**
   *
   * 지도 SDK 는 만들어질 때의 크기로 타일을 깔아 두고, 컨테이너가 커져도 스스로 알아채지
   * 못한다 — 크게보기를 누르면 상자만 아래로 늘어나고 지도는 원래 크기 그대로 남아, 늘어난
   * 부분이 빈 채로 보인다.
   *
   * 예전에는 "누른 뒤 320ms" 에 한 번 다시 그렸다. 높이 전환이 300ms 라 여유가 20ms 뿐이었고,
   * 그 사이 프레임이 밀리면 **아직 덜 자란 크기**를 읽어 그대로 굳었다. 시간을 재는 대신
   * 크기 자체를 지켜본다 — 전환이 어떻게 끝나든 마지막 크기로 맞춰진다.
   *
   * 전환 도중에는 매 프레임 크기가 바뀌므로 **멈춘 뒤 한 번만** 부른다. 다시 그리는 일은
   * 타일을 새로 받는 것이라 프레임마다 부르면 그만큼 호출이 나간다.
   */
  useEffect(() => {
    const el = mapRef.current;
    if (!el) return;

    let timer: number | undefined;
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(
        () => controllerRef.current?.refresh(),
        RESIZE_SETTLE_MS,
      );
    });

    observer.observe(el);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  /**
   * 목록이 지도보다 늦게 오거나 도중에 바뀌면 핀만 갈아 끼운다.
   * **지도를 다시 만들지 않는다** — 인스턴스 생성이 과금 단위다.
   * 최초 생성 때는 위 훅이 이미 얹었으므로 여기서는 이미 그려진 지도만 손댄다.
   */
  useEffect(() => {
    if (renderedRef.current)
      controllerRef.current?.setNearby(nearby, { anchor, onSelect: selectPoint });
  }, [nearby, anchor, selectPoint]);

  /**
   * 말풍선 클릭을 받는다.
   *
   * **위임으로 잡는다.** 말풍선은 SDK 가 열 때마다 새로 만들어 컨테이너에 꽂았다 빼는
   * DOM 이라, 우리가 그때그때 리스너를 달 방법이 없다. 컨테이너 한 곳에서 듣고 올라온
   * 클릭이 말풍선 버튼에서 왔는지만 본다.
   */
  useEffect(() => {
    const el = mapRef.current;
    if (!el || !onSelect) return;

    const onClick = (event: MouseEvent) => {
      const target = (event.target as HTMLElement | null)?.closest?.(
        '[data-map-select]',
      );
      const id = target?.getAttribute('data-map-select');
      if (id) onSelect(id);
    };

    el.addEventListener('click', onClick);
    return () => el.removeEventListener('click', onClick);
  }, [onSelect]);

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
  const toggleSize = () => setExpanded((prev) => !prev);

  return (
    // h-full: 부모가 정한 높이를 지도 상자까지 내려보낸다(height="100%" 를 쓰는 경우).
    <div className="relative h-full">
      <div
        ref={mapRef}
        className={cn(
          'w-full overflow-hidden transition-[height] duration-300',
          !bare && 'rounded-2xl border border-slate-200',
        )}
        style={{ height: expanded ? EXPANDED_HEIGHT : height }}
      />

      {/*
        지도 위에 겹친다. 확대/축소 버튼은 오른쪽 위에 있으므로 왼쪽 위를 쓴다.

        **z-10 이 필요하다.** SDK 는 컨테이너 안 요소에 제 z-index 를 매기는데(카카오가 특히
        높다), 우리 버튼은 뒤 형제라는 것만으로는 그 위에 못 올라간다 — 쌓임 순서에서
        명시된 z-index 가 auto 를 이긴다. 실제로 카카오 지도에서 이 버튼들이 타일 뒤로 숨었다.
      */}
      <div className="absolute left-3 top-3 z-10 flex flex-col gap-1.5">
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
