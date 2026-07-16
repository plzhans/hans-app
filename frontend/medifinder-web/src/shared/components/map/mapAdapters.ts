import i18n from '@/shared/i18n';

/**
 * 지도 플랫폼 어댑터.
 *
 * 네이버·카카오·구글은 SDK 로딩 방식도, 지도·마커 생성 API 도 제각각이다.
 * 그 차이를 여기 한곳에 가두고, 화면(PlatformMap)은 공통 인터페이스(load/create)만 본다.
 * 그래서 크게보기·현위치·핀·에러 UI 는 플랫폼과 무관하게 한 번만 짜면 된다.
 */

/** 지도에 찍을 한 지점. */
export interface MapPoint {
  lat: number;
  lng: number;
  name: string;
}

/** 생성된 지도를 조종하는 손잡이. 크게보기/현위치 버튼이 이걸 부른다. */
export interface MapController {
  /** 컨테이너 크기가 바뀐 뒤 다시 그린다(+ 핀을 가운데로). 확대율은 건드리지 않는다. */
  refresh(): void;
  /** 병원 위치로 되돌린다(+ 기본 확대율). */
  recenter(): void;
}

export type PlatformId = 'naver' | 'kakao' | 'google';

export interface PlatformAdapter {
  id: PlatformId;
  /** 이 플랫폼의 키. 없으면 화면이 "키 미설정" 안내를 띄운다. */
  key: string | undefined;
  /** SDK 를 로드한다(세션당 한 번). 실패하면 MapError(i18n 키)로 거절한다. */
  load(): Promise<void>;
  /** 로드가 끝난 뒤 지도를 그린다. */
  create(el: HTMLElement, point: MapPoint): MapController;
}

/** 로드/인증 실패를 i18n 키와 함께 나른다. PlatformMap 이 그 키로 문구를 번역한다. */
export class MapError extends Error {
  constructor(public i18nKey: string) {
    super(i18nKey);
  }
}

/* -------------------------------------------------------------------------- */
/* 공용 핀 (SVG data URI)                                                      */
/* -------------------------------------------------------------------------- */

interface Pin {
  url: string;
  width: number;
  height: number;
  /** 앵커(좌표를 가리키는 점). 핀의 뾰족한 끝 = 가운데 아래. */
  anchorX: number;
  anchorY: number;
}

/**
 * 이름표를 얹은 핀을 SVG 로 만든다. 세 플랫폼 모두 URL 이미지 마커로 이걸 쓴다.
 *
 * **HTML 마커가 아니라 이미지다.** 크기를 우리가 지정해야 마커가 확실히 뜬다(네이버에서 실측한 버그).
 * 이름표 폭은 글자 수로 계산한다 — SVG 는 텍스트 폭을 미리 못 재서, 한글 한 자를 13px 로 잡고
 * 여백을 더한다. 너무 길면 잘라낸다. 이름표가 지도를 덮으면 정작 위치가 안 보인다.
 */
export function buildPin(name: string): Pin {
  const label = name.length > 12 ? `${name.slice(0, 12)}…` : name;
  const escaped = label
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const labelW = Math.max(60, escaped.length * 13 + 16);
  const width = Math.max(labelW, 36);
  const height = 44 + 30;
  const cx = width / 2;

  const svg = [
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

  return {
    url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    width,
    height,
    anchorX: cx,
    anchorY: height,
  };
}

/** BCP-47 로케일(en-us…)을 네이버/구글이 받는 짧은 코드로 줄인다. 지원 밖은 한국어. */
function shortLang(locale: string): 'ko' | 'en' | 'zh' | 'ja' {
  const base = locale.toLowerCase().split('-')[0];
  return base === 'en' || base === 'zh' || base === 'ja' ? base : 'ko';
}

/* -------------------------------------------------------------------------- */
/* SDK 타입 (쓰는 것만 선언 — 공식 타입 패키지가 없거나 무겁다)                 */
/* -------------------------------------------------------------------------- */

interface NaverMapInstance {
  refresh: (noEffect?: boolean) => void;
  panTo: (coord: object, opts?: object) => void;
  setZoom: (zoom: number, effect?: boolean) => void;
}

interface KakaoMapInstance {
  relayout: () => void;
  setCenter: (latlng: object) => void;
  setLevel: (level: number) => void;
  addControl: (control: object, position: unknown) => void;
}

interface GoogleMapInstance {
  setCenter: (latlng: object) => void;
  setZoom: (zoom: number) => void;
}

declare global {
  interface Window {
    naver: {
      maps: {
        Map: new (el: HTMLElement, opts: object) => NaverMapInstance;
        LatLng: new (lat: number, lng: number) => object;
        Marker: new (opts: object) => object;
        Point: new (x: number, y: number) => object;
        Size: new (w: number, h: number) => object;
        Position: { TOP_RIGHT: unknown };
      };
    };
    /** 네이버가 인증 실패 시 부르는 전역 훅. */
    navermap_authFailure?: () => void;

    kakao: {
      maps: {
        load: (cb: () => void) => void;
        Map: new (el: HTMLElement, opts: object) => KakaoMapInstance;
        LatLng: new (lat: number, lng: number) => object;
        Marker: new (opts: object) => object;
        MarkerImage: new (url: string, size: object, opts: object) => object;
        Point: new (x: number, y: number) => object;
        Size: new (w: number, h: number) => object;
        ZoomControl: new () => object;
        ControlPosition: { TOPRIGHT: unknown };
      };
    };

    google: {
      maps: {
        Map: new (el: HTMLElement, opts: object) => GoogleMapInstance;
        Marker: new (opts: object) => object;
        Point: new (x: number, y: number) => object;
        Size: new (w: number, h: number) => object;
        ControlPosition: { RIGHT_TOP: unknown };
        event: { trigger: (target: object, event: string) => void };
      };
    };
    /** 구글 SDK 로드 완료 콜백(스크립트 URL 의 callback 파라미터). */
    __googleMapsReady?: () => void;
  }
}

/* -------------------------------------------------------------------------- */
/* 네이버                                                                      */
/* -------------------------------------------------------------------------- */

const NAVER_KEY = import.meta.env.VITE_NCLOUD_CLIENT_ID as string | undefined;
let naverPromise: Promise<void> | null = null;

function loadNaver(): Promise<void> {
  if (naverPromise) return naverPromise;
  const lang = shortLang(i18n.language);
  naverPromise = new Promise<void>((resolve, reject) => {
    /**
     * 인증 실패는 스크립트 로드(200) **이후에** 별도 요청으로 판정된다. 네이버가 이 훅을 부른다.
     * 아직 대기 중이면 거절해 화면에 안내를 띄운다.
     */
    window.navermap_authFailure = () => reject(new MapError('map.authFailed'));
    const s = document.createElement('script');
    s.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${NAVER_KEY}&language=${lang}`;
    s.onload = () => resolve();
    s.onerror = () => reject(new MapError('map.loadFailed'));
    document.head.appendChild(s);
  });
  return naverPromise;
}

export const naverAdapter: PlatformAdapter = {
  id: 'naver',
  key: NAVER_KEY,
  load: loadNaver,
  create(el, point) {
    const m = window.naver.maps;
    const center = new m.LatLng(point.lat, point.lng);
    const map = new m.Map(el, {
      center,
      zoom: 17,
      zoomControl: true,
      zoomControlOptions: { position: m.Position.TOP_RIGHT },
      scaleControl: false,
      mapDataControl: false,
    });

    const pin = buildPin(point.name);
    new m.Marker({
      position: center,
      map,
      title: point.name,
      icon: {
        url: pin.url,
        size: new m.Size(pin.width, pin.height),
        scaledSize: new m.Size(pin.width, pin.height),
        anchor: new m.Point(pin.anchorX, pin.anchorY),
      },
    });

    return {
      refresh: () => {
        map.refresh();
        map.panTo(center);
      },
      recenter: () => {
        map.panTo(center);
        map.setZoom(17, true);
      },
    };
  },
};

/* -------------------------------------------------------------------------- */
/* 카카오 (구 다음 지도 → 카카오맵으로 통합)                                    */
/* -------------------------------------------------------------------------- */

const KAKAO_KEY = import.meta.env.VITE_KAKAO_JS_KEY as string | undefined;
let kakaoPromise: Promise<void> | null = null;

function loadKakao(): Promise<void> {
  if (kakaoPromise) return kakaoPromise;
  kakaoPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    // autoload=false: 스크립트 로드와 SDK 초기화를 분리한다. kakao.maps.load 로 직접 켠다.
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_KEY}&autoload=false`;
    s.onload = () => window.kakao.maps.load(() => resolve());
    s.onerror = () => reject(new MapError('map.loadFailed'));
    document.head.appendChild(s);
  });
  return kakaoPromise;
}

/** 카카오 확대율은 level 로 준다(작을수록 가깝다). 3 이 도로가 보이는 거리다. */
const KAKAO_LEVEL = 3;

export const kakaoAdapter: PlatformAdapter = {
  id: 'kakao',
  key: KAKAO_KEY,
  load: loadKakao,
  create(el, point) {
    const m = window.kakao.maps;
    const center = new m.LatLng(point.lat, point.lng);
    const map = new m.Map(el, { center, level: KAKAO_LEVEL });
    map.addControl(new m.ZoomControl(), m.ControlPosition.TOPRIGHT);

    const pin = buildPin(point.name);
    new m.Marker({
      position: center,
      map,
      image: new m.MarkerImage(pin.url, new m.Size(pin.width, pin.height), {
        offset: new m.Point(pin.anchorX, pin.anchorY),
      }),
    });

    return {
      refresh: () => {
        map.relayout();
        map.setCenter(center);
      },
      recenter: () => {
        map.setCenter(center);
        map.setLevel(KAKAO_LEVEL);
      },
    };
  },
};

/* -------------------------------------------------------------------------- */
/* 구글                                                                        */
/* -------------------------------------------------------------------------- */

const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
let googlePromise: Promise<void> | null = null;

function loadGoogle(): Promise<void> {
  if (googlePromise) return googlePromise;
  const lang = shortLang(i18n.language);
  googlePromise = new Promise<void>((resolve, reject) => {
    window.__googleMapsReady = () => resolve();
    const s = document.createElement('script');
    s.src =
      `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_KEY}` +
      `&language=${lang}&loading=async&callback=__googleMapsReady`;
    s.async = true;
    s.onerror = () => reject(new MapError('map.loadFailed'));
    document.head.appendChild(s);
  });
  return googlePromise;
}

export const googleAdapter: PlatformAdapter = {
  id: 'google',
  key: GOOGLE_KEY,
  load: loadGoogle,
  create(el, point) {
    const m = window.google.maps;
    const center = { lat: point.lat, lng: point.lng };
    const map = new m.Map(el, {
      center,
      zoom: 17,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      clickableIcons: false,
      zoomControl: true,
      zoomControlOptions: { position: m.ControlPosition.RIGHT_TOP },
    });

    const pin = buildPin(point.name);
    new m.Marker({
      position: center,
      map,
      title: point.name,
      icon: {
        url: pin.url,
        scaledSize: new m.Size(pin.width, pin.height),
        anchor: new m.Point(pin.anchorX, pin.anchorY),
      },
    });

    return {
      refresh: () => {
        m.event.trigger(map, 'resize');
        map.setCenter(center);
      },
      recenter: () => {
        map.setCenter(center);
        map.setZoom(17);
      },
    };
  },
};

/** 탭 순서 = 표시 순서. 기본은 첫 번째(네이버). */
export const MAP_ADAPTERS: readonly PlatformAdapter[] = [
  naverAdapter,
  kakaoAdapter,
  googleAdapter,
];
