import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Crosshair, Maximize2, Minimize2 } from 'lucide-react';

/** 우리가 쓰는 것만 선언한다. 네이버는 공식 타입 패키지를 주지 않는다. */
interface NaverMapInstance {
  /** 컨테이너 크기가 바뀌면 지도가 잘려 보인다. **크기 변경 후 반드시 부른다.** */
  refresh: (noEffect?: boolean) => void;

  /** 부드럽게 이동. 목표가 화면 밖이면 즉시 이동한다. */
  panTo: (coord: object, opts?: object) => void;

  setZoom: (zoom: number, effect?: boolean) => void;
}

declare global {
  interface Window {
    naver: {
      maps: {
        Map: new (el: HTMLElement | string, opts: object) => NaverMapInstance;
        LatLng: new (lat: number, lng: number) => object;
        Marker: new (opts: object) => object;
        Point: new (x: number, y: number) => object;
        Size: new (width: number, height: number) => object;
        Position: { TOP_RIGHT: unknown };
      };
    };

    /** 네이버가 인증 실패 시 호출하는 전역 훅. */
    navermap_authFailure?: () => void;
  }
}

interface NaverMapProps {
  lat: number | null | undefined;
  lng: number | null | undefined;
  name: string;
  height?: string;
}

const CLIENT_ID = import.meta.env.VITE_NCLOUD_CLIENT_ID as string | undefined;

// 스크립트는 한 번만 로드한다(여러 지도가 떠도 중복 요청 방지).
let scriptLoaded = false;
let scriptLoading = false;
/** 에러는 모듈 스코프(React 밖)에서 나온다. 문구 대신 **번역 키**를 넘겨 렌더 시점에 번역한다. */
const scriptCallbacks: ((errorKey?: string) => void)[] = [];

function settle(errorKey?: string) {
  scriptLoading = false;
  scriptLoaded = errorKey === undefined;
  scriptCallbacks.forEach((cb) => cb(errorKey));
  scriptCallbacks.length = 0;
}

function loadNaverScript(callback: (errorKey?: string) => void) {
  if (scriptLoaded) {
    callback();
    return;
  }
  scriptCallbacks.push(callback);
  if (scriptLoading) return;
  scriptLoading = true;

  /**
   * 인증 실패는 스크립트 로드 성공(200) **이후에** 별도 요청으로 판정된다.
   * 네이버는 그때 이 전역 함수를 부른다. 잡지 않으면 지도가 조용히 안 뜬다 —
   * 실제로 키에 localhost 만 등록돼 있어 127.0.0.1 로 접속하면 여기로 온다.
   */
  window.navermap_authFailure = () => {
    settle('map.authFailed');
  };

  const script = document.createElement('script');
  script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${CLIENT_ID}`;
  script.onload = () => settle();
  script.onerror = () => settle('map.loadFailed');
  document.head.appendChild(script);
}

/**
 * 네이버 지도. 이 컴포넌트가 마운트될 때 비로소 스크립트를 로드하므로,
 * 지도 열기 버튼으로 조건부 렌더링하면 실제로 열 때만 지도 API 를 호출한다.
 */
export function NaverMap({ lat, lng, name, height = '260px' }: NaverMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const renderedRef = useRef(false);

  /** 지도 인스턴스. 크게보기·핀이동 버튼이 여기에 명령한다. */
  const mapObj = useRef<NaverMapInstance | null>(null);

  /** 핀 좌표. "현위치로" 버튼이 여기로 되돌린다. */
  const centerRef = useRef<object | null>(null);

  const { t } = useTranslation();
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!CLIENT_ID) return;

    function renderMap() {
      if (!mapRef.current || renderedRef.current || !window.naver?.maps) return;
      renderedRef.current = true;

      const hasCoords = lat != null && lng != null && !isNaN(lat) && !isNaN(lng);
      const center = hasCoords
        ? new window.naver.maps.LatLng(lat!, lng!)
        : new window.naver.maps.LatLng(37.5665, 126.978);

      // 엘리먼트를 직접 넘긴다. id 문자열로 넘기면 좌표의 소수점(37.49…)이
      // CSS 선택자에서 클래스 구분자로 해석돼 요소를 못 찾는다.
      const map = new window.naver.maps.Map(mapRef.current, {
        center,
        zoom: hasCoords ? 17 : 11,

        // 네이버 기본 확대/축소 버튼. 직접 만들 필요가 없다 —
        // SDK 가 접근성·터치까지 처리해 준다. 예전엔 false 라 버튼이 아예 없었다.
        zoomControl: true,
        zoomControlOptions: { position: window.naver.maps.Position.TOP_RIGHT },

        scaleControl: false,
        mapDataControl: false,
      });

      mapObj.current = map;
      centerRef.current = center;

      if (!hasCoords) return;

      /**
       * 병원 핀 + 이름표.
       *
       * **HTML 마커가 아니라 이미지(SVG data URI) 마커다.** 네이버는 content(HTML)만 주고
       * size 를 안 주면 요소 크기를 못 재서 마커가 아예 안 나온다. 실제로 그 버그를 겪었다.
       * ImageIcon(url + size + anchor)은 크기를 우리가 지정하므로 확실하다.
       *
       * 이름표 폭은 **글자 수로 계산한다.** SVG 는 텍스트 폭을 미리 알 수 없어서,
       * 한글 한 글자를 13px 로 잡고 여백을 더한다. 너무 길면 잘라낸다 —
       * 이름표가 지도를 덮으면 정작 위치가 안 보인다.
       */
      const label = name.length > 12 ? `${name.slice(0, 12)}…` : name;
      const escaped = label
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      const labelW = Math.max(60, escaped.length * 13 + 16);
      const width = Math.max(labelW, 36);
      const height = 44 + 30;
      const cx = width / 2;

      const pin = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,

        // 이름표 (핀 위)
        `<rect x="${cx - labelW / 2}" y="0" width="${labelW}" height="24" rx="12"`,
        ' fill="#2563EB" stroke="#fff" stroke-width="1.5"/>',
        `<text x="${cx}" y="16" text-anchor="middle" fill="#fff" font-size="12"`,
        ' font-weight="600" font-family="-apple-system, BlinkMacSystemFont, sans-serif">',
        escaped,
        '</text>',

        // 핀 (아래)
        `<g transform="translate(${cx - 18}, 30)">`,
        '<path d="M18 43C18 43 34 27.5 34 17A16 16 0 1 0 2 17C2 27.5 18 43 18 43Z"',
        ' fill="#2563EB" stroke="#fff" stroke-width="2"/>',
        '<circle cx="18" cy="17" r="9" fill="#fff"/>',
        '<path d="M16 11h4v4h4v4h-4v4h-4v-4h-4v-4h4z" fill="#2563EB"/>',
        '</g>',
        '</svg>',
      ].join('');

      new window.naver.maps.Marker({
        position: center,
        map,
        title: name,
        icon: {
          url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pin)}`,
          size: new window.naver.maps.Size(width, height),
          scaledSize: new window.naver.maps.Size(width, height),
          // 핀의 뾰족한 끝(가운데 아래)이 좌표를 가리킨다.
          anchor: new window.naver.maps.Point(cx, height),
        },
      });
    }

    loadNaverScript((failure) => {
      if (failure) {
        setErrorKey(failure);
        return;
      }
      renderMap();
    });
  }, [lat, lng, name]);

  if (!CLIENT_ID) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">
        {t('map.noKey')}
      </div>
    );
  }

  if (errorKey) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center text-sm text-amber-700">
        {t(errorKey)}
      </div>
    );
  }

  /**
   * 지도를 키우거나 줄인다.
   *
   * **크기를 바꾼 뒤 map.refresh() 를 불러야 한다.** 네이버 지도는 생성 시점의 컨테이너 크기를
   * 기억하고 타일을 그리기 때문에, 컨테이너만 커지면 지도가 잘린 채 회색 여백이 생긴다.
   * CSS 전환(300ms)이 끝난 뒤 불러야 최종 크기를 잰다.
   */
  const toggleSize = () => {
    setExpanded((prev) => !prev);

    window.setTimeout(() => {
      mapObj.current?.refresh();
      // 크기가 바뀌면 핀이 중앙에서 밀린다. 다시 가운데로 데려온다.
      if (centerRef.current) {
        mapObj.current?.panTo(centerRef.current);
      }
    }, 320);
  };

  /** 핀 위치로 되돌린다. 지도를 끌어 옮긴 뒤 병원을 다시 찾을 때 쓴다. */
  const recenter = () => {
    if (centerRef.current) {
      mapObj.current?.panTo(centerRef.current);
      mapObj.current?.setZoom(17, true);
    }
  };

  return (
    <div className="relative">
      <div
        ref={mapRef}
        className="w-full overflow-hidden rounded-2xl border border-slate-200 transition-[height] duration-300"
        style={{ height: expanded ? EXPANDED_HEIGHT : height }}
      />

      {/* 지도 위에 겹친다. 네이버 확대/축소 버튼은 오른쪽 위에 있으므로 왼쪽 위를 쓴다. */}
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
          onClick={recenter}
          title={t('map.recenter')}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/95 text-slate-600 shadow-md ring-1 ring-slate-200 backdrop-blur transition-colors hover:text-primary-600"
        >
          <Crosshair className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/** 크게 보기 높이. 지도만 화면을 다 먹지 않도록 뷰포트의 70% 로 제한한다. */
const EXPANDED_HEIGHT = '70vh';
