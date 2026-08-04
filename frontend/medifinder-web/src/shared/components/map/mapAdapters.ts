import i18n from '@/shared/i18n';
import { rankLabel, rankMark } from '@/shared/lib/rankMark';

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
  /**
   * 번호 핀에 찍을 숫자. 곁들임 지점에만 준다.
   *
   * **배열 순서로 매기지 않는다.** 좌표가 없는 병원은 지도에 못 찍혀 배열에서 빠지는데,
   * 그러면 목록의 3번이 지도의 2번이 되어 서로 못 알아본다. 목록이 정한 번호를 그대로 받는다.
   */
  rank?: number;
}

/** 생성된 지도를 조종하는 손잡이. 크게보기/현위치 버튼이 이걸 부른다. */
export interface MapController {
  /** 컨테이너 크기가 바뀐 뒤 다시 그린다(+ 핀을 가운데로). 확대율은 건드리지 않는다. */
  refresh(): void;
  /** 병원 위치로 되돌린다(+ 기본 확대율). */
  recenter(): void;
  /**
   * 곁들임 핀(근처의 비슷한 병원)을 갈아 끼운다. 이전 것은 지운다.
   *
   * **생성(create)이 아니라 별도 메서드인 이유**는 이 목록이 지도보다 늦게 도착할 수 있어서다 —
   * 지도는 사용자가 "지도 보기" 를 누르는 순간 만들어지는데, 그때 근처 병원 조회가 아직
   * 안 끝났을 수 있다. 지도를 다시 만들면 SDK 호출이 또 오르므로(과금) 핀만 얹는다.
   */
  setNearby(points: MapPoint[]): void;
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

/** 기준 병원 핀 색(위치 섹션). 그 지도에서는 이 병원이 주인공이다. */
const PIN_PRIMARY = '#2563EB';

/**
 * 기준 병원 핀 색(근처 섹션).
 *
 * **여기서는 기준 병원이 주인공이 아니다.** 사용자는 이미 이 병원의 상세를 보고 있고,
 * 이 지도를 연 이유는 **나머지 다섯 곳**을 보려는 것이다. 파랗게 부각하면 정작 봐야 할
 * 후보들이 뒤로 밀린다. "여기가 기준점" 만 알려주고 물러난다.
 */
const PIN_ANCHOR = '#94A3B8';

/**
 * 이름표를 얹은 핀을 SVG 로 만든다. 세 플랫폼 모두 URL 이미지 마커로 이걸 쓴다.
 *
 * **HTML 마커가 아니라 이미지다.** 크기를 우리가 지정해야 마커가 확실히 뜬다(네이버에서 실측한 버그).
 * 이름표 폭은 글자 수로 계산한다 — SVG 는 텍스트 폭을 미리 못 재서, 한글 한 자를 13px 로 잡고
 * 여백을 더한다. 너무 길면 잘라낸다. 이름표가 지도를 덮으면 정작 위치가 안 보인다.
 *
 * **위치 섹션 지도 전용이다.** 근처 섹션에서는 기준 병원도 이름표 없이 회색으로만 둔다
 * (buildAnchorPin) — 이미 그 병원 상세를 보고 있어 이름이 화면에 여러 번 나와 있다.
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
    ` fill="${PIN_PRIMARY}" stroke="#fff" stroke-width="1.5"/>`,
    `<text x="${cx}" y="16" text-anchor="middle" fill="#fff" font-size="12"`,
    ' font-weight="600" font-family="-apple-system, BlinkMacSystemFont, sans-serif">',
    escaped,
    '</text>',
    // 핀 (아래)
    `<g transform="translate(${cx - 18}, 30)">`,
    '<path d="M18 43C18 43 34 27.5 34 17A16 16 0 1 0 2 17C2 27.5 18 43 18 43Z"',
    ` fill="${PIN_PRIMARY}" stroke="#fff" stroke-width="2"/>`,
    '<circle cx="18" cy="17" r="9" fill="#fff"/>',
    `<path d="M16 11h4v4h4v4h-4v4h-4v-4h-4v-4h4z" fill="${PIN_PRIMARY}"/>`,
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

/**
 * 근처 섹션의 기준 병원 핀. **이름표가 없다.**
 *
 * 이름을 달지 않는 이유는 이미 화면 여기저기에 있어서다 — 헤더에 큼직하게, 주소 줄에,
 * 그리고 이 지도는 그 병원 상세 안에 있다. 지도에서까지 이름을 되풀이하면 정작 봐야 할
 * 후보 번호들과 자리를 다툰다. 여기서 이 핀이 할 일은 "기준점이 여기" 하나뿐이다.
 *
 * 병원 십자 아이콘도 없다 — 이 지도의 핀은 전부 병원이라 아무것도 구분해주지 않는다.
 */
export function buildAnchorPin(): Pin {
  const width = 36;
  const height = 44;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    '<path d="M18 43C18 43 34 27.5 34 17A16 16 0 1 0 2 17C2 27.5 18 43 18 43Z"',
    ` fill="${PIN_ANCHOR}" stroke="#fff" stroke-width="2"/>`,
    '<circle cx="18" cy="17" r="6" fill="#fff"/>',
    '</svg>',
  ].join('');

  return {
    url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    width,
    height,
    anchorX: width / 2,
    anchorY: height,
  };
}

/**
 * 순위 표식(A·B·C…)만 담은 **모난** 핀.
 *
 * 이름표를 버린 이유는 **겹침** 때문이다. 근처 병원 다섯 곳은 의원 기준으로 300m 안에
 * 모이는데, 이름표가 붙으면 말풍선끼리 서로 덮어 아무것도 못 읽는다. 작은 도형은 겹칠
 * 면적 자체가 작고, 겹쳐도 글자는 보인다.
 *
 * **동그라미도 숫자도 아닌 이유**는 이 앱에서 그 조합이 이미 지하철 노선 배지이기 때문이다
 * (LineBadge). 글자를 알파벳으로 바꿔 충돌을 없애고(rankLabel 주석 참고), 모양까지
 * 사각형으로 갈라 한 카드에 둘이 같이 떠도 한눈에 구분되게 한다.
 *
 * **흐리게 하지 않는다.** 뒤로 물리려고 투명도를 주면 글자가 안 읽힌다.
 * 카드에도 같은 글자·같은 색·같은 모양을 달아 지도와 목록이 서로 찾히게 한다.
 */
export function buildRankPin(rank: number): Pin {
  const size = 28;
  const inset = 2;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
    `<rect x="${inset}" y="${inset}" width="${size - inset * 2}" height="${size - inset * 2}"`,
    ` rx="7" fill="${rankMark(rank).solid}" stroke="#fff" stroke-width="2.5"/>`,
    `<text x="${size / 2}" y="${size / 2 + 4.5}" text-anchor="middle" fill="#fff" font-size="13"`,
    ' font-weight="700" font-family="-apple-system, BlinkMacSystemFont, sans-serif">',
    rankLabel(rank),
    '</text>',
    '</svg>',
  ].join('');

  return {
    url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    width: size,
    height: size,
    // 뾰족한 끝이 없는 도형이다 — 가운데가 그 좌표다.
    anchorX: size / 2,
    anchorY: size / 2,
  };
}

/**
 * 핀이 겹칠 때 누가 위로 오는가.
 *
 * **지도마다 주인공이 다르다.**
 *   위치 섹션   primary — 이 병원이 주인공이라 맨 위.
 *   근처 섹션   rank > anchor — 봐야 할 건 번호들이다. 기준 병원이 깔린다.
 *
 * 흩어놓아도(spreadOverlaps) 확대율이 넓으면 18m 가 몇 픽셀이라 여전히 겹친다.
 * 그때 **가려질 쪽은 기준 병원**이어야 한다 — 이미 보고 있는 병원이라 가려져도 잃는 게
 * 없지만, 번호가 가려지면 그 후보를 아예 못 누른다.
 *
 * 마커를 만드는 순서로도 대개 되지만(늦게 만든 게 위) SDK 마다 규칙이 달라 zIndex 를 명시한다.
 */
const PIN_Z = { primary: 100, rank: 50, anchor: 10 } as const;

/**
 * 번호 핀을 눌렀을 때 뜨는 말풍선의 내용(HTML 문자열).
 *
 * **핀에는 번호만 있으니 이름은 눌러야 나온다.** 이름표를 다 달면 서로 덮어서 못 읽고,
 * 안 달면 어디가 어딘지 모른다 — 눌렀을 때만 보여주는 게 둘 사이의 답이다.
 *
 * 세 SDK 의 InfoWindow 가 전부 HTML 문자열을 받으므로 한 벌로 쓴다. **이름은 반드시
 * 이스케이프한다** — 병원 이름에 <, & 가 들어간 사례가 실제로 있다.
 */
function infoContent(point: MapPoint): string {
  const name = point.name
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const rank =
    point.rank === undefined
      ? ''
      : `<span style="display:inline-flex;align-items:center;justify-content:center;` +
        `width:18px;height:18px;margin-right:6px;border-radius:5px;` +
        `background:${rankMark(point.rank).solid};color:#fff;font-size:11px;font-weight:700">` +
        `${rankLabel(point.rank)}</span>`;
  return (
    `<div style="display:flex;align-items:center;white-space:nowrap;` +
    `padding:7px 11px;font-size:13px;font-weight:600;color:#0f172a;` +
    `font-family:-apple-system,BlinkMacSystemFont,sans-serif">${rank}${name}</div>`
  );
}

/**
 * 좌표가 겹치는 핀을 벌려 놓는 반지름(m).
 *
 * **상가 하나에 의원이 여럿이면 좌표가 완전히 같다** — 실제로 "큐비 메디컬센터" 한 건물에
 * 아홉 곳이 같은 점에 있었다. 그대로 찍으면 핀이 정확히 포개져 **아래 것을 누를 수가 없다.**
 *
 * 18m 는 우리가 이미 감수하는 오차 안이다 — 화면 거리는 100m 단위로 올려 뭉개 표시하고
 * (formatDistance), 애초에 병원 좌표는 건물 단위라 출입구·층까지는 못 가리킨다.
 */
const OVERLAP_SPREAD_METERS = 18;

/** 위도 1도의 거리(m). 경도는 위도에 따라 줄어 cos 를 곱한다. */
const METERS_PER_LAT_DEGREE = 111_320;

/**
 * 같은 좌표에 몰린 지점들을 작은 원으로 흩는다. 겹치지 않는 지점은 그대로 둔다.
 *
 * 기준 병원도 자리를 하나 차지한 것으로 세어, **기준 병원과 같은 건물에 있는 후보**도
 * 밀려나게 한다(그 경우가 제일 흔하다 — 같은 상가 안에서 고르는 상황이라).
 *
 * 소수점 5자리(약 1m)로 묶는다. 그보다 가까우면 어차피 화면에서 같은 점이다.
 */
function spreadOverlaps(center: MapPoint, points: MapPoint[]): MapPoint[] {
  const keyOf = (p: { lat: number; lng: number }) =>
    `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;

  // 자리별 인원. 기준 병원이 이미 한 자리를 잡고 있다.
  const crowd = new Map<string, number>([[keyOf(center), 1]]);
  for (const p of points) {
    crowd.set(keyOf(p), (crowd.get(keyOf(p)) ?? 0) + 1);
  }

  const placed = new Map<string, number>();
  return points.map((p) => {
    const key = keyOf(p);
    const total = crowd.get(key) ?? 1;
    if (total < 2) {
      return p;
    }
    // 이 자리의 몇 번째인가. 기준 병원이 낀 자리는 그 몫만큼 각도를 비켜 간다.
    const index = placed.get(key) ?? (key === keyOf(center) ? 1 : 0);
    placed.set(key, index + 1);

    const angle = (2 * Math.PI * index) / total;
    const dLat =
      (OVERLAP_SPREAD_METERS * Math.sin(angle)) / METERS_PER_LAT_DEGREE;
    const dLng =
      (OVERLAP_SPREAD_METERS * Math.cos(angle)) /
      (METERS_PER_LAT_DEGREE * Math.cos((p.lat * Math.PI) / 180));
    return { ...p, lat: p.lat + dLat, lng: p.lng + dLng };
  });
}

/** 핀이 가장자리에 딱 붙지 않게 두는 여유. */
const BOUNDS_PADDING = 1.25;

/**
 * 곁들임 점들이 다 들어가되 **기준점이 정확히 가운데** 남는 사각형.
 *
 * 그냥 전체를 감싸면(일반적인 fitBounds) 무게중심이 가운데로 가서 정작 보고 있는 병원이
 * 한쪽으로 밀린다. 기준점에서 가장 먼 거리를 반지름으로 잡아 **대칭**으로 만든다.
 *
 * 모든 점이 기준점과 같은 좌표면(같은 건물) 사각형이 한 점이 되어 확대율이 튄다 —
 * 그때는 undefined 를 내고 호출자가 기본 확대율을 그대로 쓰게 한다.
 */
function symmetricBounds(
  center: MapPoint,
  points: MapPoint[],
): { sw: { lat: number; lng: number }; ne: { lat: number; lng: number } } | undefined {
  if (points.length === 0) return undefined;

  const dLat = Math.max(...points.map((p) => Math.abs(p.lat - center.lat)));
  const dLng = Math.max(...points.map((p) => Math.abs(p.lng - center.lng)));
  if (dLat === 0 && dLng === 0) return undefined;

  const padLat = dLat * BOUNDS_PADDING;
  const padLng = dLng * BOUNDS_PADDING;
  return {
    sw: { lat: center.lat - padLat, lng: center.lng - padLng },
    ne: { lat: center.lat + padLat, lng: center.lng + padLng },
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

/**
 * 지도에서 뗄 수 있는 마커. 세 SDK 모두 `setMap(null)` 로 뗀다 —
 * 곁들임 핀을 갈아 끼울 때(setNearby) 이전 것을 이걸로 지운다.
 */
interface RemovableMarker {
  setMap: (map: object | null) => void;
}

/** 열고 닫을 수 있는 말풍선. 세 SDK 가 모두 open/close 를 준다(여는 인자만 다르다). */
interface InfoWindowInstance {
  close: () => void;
  setContent: (html: string) => void;
}

/** 전역 이벤트 등록기(네이버 Event, 카카오 event). 마커·지도에 클릭을 건다. */
interface EventRegistry {
  addListener: (target: object, type: string, handler: () => void) => void;
  /** 지도에 이벤트를 직접 쏜다. 컨테이너 크기가 바뀐 걸 알릴 때 쓴다(아래 naver refresh). */
  trigger: (target: object, type: string) => void;
}

interface NaverMapInstance {
  refresh: (noEffect?: boolean) => void;
  panTo: (coord: object, opts?: object) => void;
  setZoom: (zoom: number, effect?: boolean) => void;
  fitBounds: (bounds: object) => void;
}

interface KakaoMapInstance {
  relayout: () => void;
  setCenter: (latlng: object) => void;
  setLevel: (level: number) => void;
  addControl: (control: object, position: unknown) => void;
  setBounds: (bounds: object) => void;
}

interface GoogleMapInstance {
  setCenter: (latlng: object) => void;
  setZoom: (zoom: number) => void;
  fitBounds: (bounds: object) => void;
  addListener: (type: string, handler: () => void) => void;
}

/** 카카오·구글의 빈 경계 상자. 모서리를 extend 로 넣어 만든다. */
interface ExtendableBounds {
  extend: (latlng: object) => void;
}

declare global {
  interface Window {
    naver: {
      maps: {
        Map: new (el: HTMLElement, opts: object) => NaverMapInstance;
        LatLng: new (lat: number, lng: number) => object;
        LatLngBounds: new (sw: object, ne: object) => object;
        Marker: new (opts: object) => RemovableMarker;
        InfoWindow: new (opts: object) => InfoWindowInstance & {
          open: (map: object, anchor: object) => void;
        };
        Event: EventRegistry;
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
        LatLngBounds: new () => ExtendableBounds;
        Marker: new (opts: object) => RemovableMarker;
        InfoWindow: new (opts: object) => InfoWindowInstance & {
          open: (map: object, anchor: object) => void;
        };
        event: EventRegistry;
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
        LatLngBounds: new () => ExtendableBounds;
        Marker: new (opts: object) => RemovableMarker & {
          addListener: (type: string, handler: () => void) => void;
        };
        InfoWindow: new (opts: object) => InfoWindowInstance & {
          open: (opts: object) => void;
        };
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

    const marker = (p: MapPoint, pin: Pin, zIndex: number) =>
      new m.Marker({
        position: new m.LatLng(p.lat, p.lng),
        map,
        title: p.name,
        zIndex,
        icon: {
          url: pin.url,
          size: new m.Size(pin.width, pin.height),
          scaledSize: new m.Size(pin.width, pin.height),
          anchor: new m.Point(pin.anchorX, pin.anchorY),
        },
      });

    let anchorMarker = marker(point, buildPin(point.name), PIN_Z.primary);
    let nearby: RemovableMarker[] = [];
    let restore: (() => void) | undefined;

    // 말풍선은 하나만 만들어 돌려 쓴다 — 핀마다 만들면 여러 개가 동시에 떠 지도를 덮는다.
    const info = new m.InfoWindow({ content: '', borderWidth: 0 });
    m.Event.addListener(map, 'click', () => info.close());

    return {
      refresh: () => {
        /*
          **resize 를 직접 쏜다.** `map.refresh()` 는 이미 알고 있는 크기로 다시 그릴 뿐이라,
          컨테이너가 커져도 지도는 예전 크기 그대로 남는다 — 크게보기를 눌렀을 때 늘어난
          아래쪽이 잘린 채 비어 보이는 게 그래서다. resize 를 받아야 컨테이너를 다시 잰다.
        */
        m.Event.trigger(map, 'resize');
        map.refresh();
        map.panTo(center);
      },
      recenter: () => {
        // 곁들임 핀이 있으면 **처음 보여준 그 뷰**로 돌아간다. 확대율 17 로 되돌리면
        // 정작 보러 온 근처 병원들이 화면 밖으로 나간다.
        if (restore) {
          restore();
          return;
        }
        map.panTo(center);
        map.setZoom(17, true);
      },
      setNearby: (points) => {
        info.close();
        nearby.forEach((mk) => mk.setMap(null));

        // 같은 건물에 몰린 핀을 벌려 놓는다(안 그러면 아래 것을 못 누른다).
        const spread = spreadOverlaps(point, points);

        // 곁들임이 있으면 기준 병원은 뒤로 물린다 — 이 지도의 주인공은 후보들이다.
        anchorMarker.setMap(null);
        anchorMarker = marker(
          point,
          points.length > 0 ? buildAnchorPin() : buildPin(point.name),
          points.length > 0 ? PIN_Z.anchor : PIN_Z.primary,
        );

        nearby = spread.map((p, i) => {
          const mk = marker(p, buildRankPin(p.rank ?? i + 1), PIN_Z.rank);
          m.Event.addListener(mk, 'click', () => {
            // 누른 핀을 가운데로 옮긴다. **말풍선이 잘리는 걸 막는 가장 싼 방법**이다 —
            // 지도 컨테이너가 overflow-hidden 이라 가장자리에서 열리면 잘리고,
            // 왼쪽 위는 크게보기·현위치 버튼이 덮는다. 가운데면 둘 다 피한다.
            map.panTo(new m.LatLng(p.lat, p.lng));
            info.setContent(infoContent(p));
            info.open(map, mk);
          });
          return mk;
        });

        // 곁들임이 있으면 다 들어오게 확대율을 맞춘다. 없으면 기본 확대율 그대로.
        const box = symmetricBounds(point, spread);
        if (!box) {
          restore = undefined;
          return;
        }
        const bounds = new m.LatLngBounds(
          new m.LatLng(box.sw.lat, box.sw.lng),
          new m.LatLng(box.ne.lat, box.ne.lng),
        );
        restore = () => map.fitBounds(bounds);
        restore();
      },
    };
  },
};

/* -------------------------------------------------------------------------- */
/* 카카오 (구 다음 지도 → 카카오맵으로 통합)                                    */
/* -------------------------------------------------------------------------- */

const KAKAO_KEY = import.meta.env.VITE_KAKAO_JS_KEY as string | undefined;

/** 카카오 SDK 초기화를 기다리는 한계 시간(ms). 넘으면 실패로 본다 — 위 주석 참고. */
const KAKAO_LOAD_TIMEOUT_MS = 8000;
let kakaoPromise: Promise<void> | null = null;

function loadKakao(): Promise<void> {
  if (kakaoPromise) return kakaoPromise;
  kakaoPromise = new Promise<void>((resolve, reject) => {
    /**
     * **카카오는 실패를 알려주지 않는다.**
     *
     * 네이버는 authFailure 훅을, 구글은 콜백 미호출을 준다. 카카오는 스크립트가 200 으로
     * 받아진 뒤 `kakao.maps.load()` 로 본 모듈을 받는데, 그 단계에서 키·도메인이 거절되면
     * **콜백이 영영 안 불린다** — 오류도 없고 화면도 안 바뀌어, 빈 상자만 남은 채 무한정
     * 기다리게 된다. 무엇이 잘못됐는지 짐작할 단서가 하나도 없는 상태가 그렇게 만들어진다.
     *
     * 그래서 시간을 끊는다. 원인까지는 알 수 없지만 "못 불러왔다" 는 말은 할 수 있다.
     */
    const timer = window.setTimeout(
      () => reject(new MapError('map.loadFailed')),
      KAKAO_LOAD_TIMEOUT_MS,
    );
    const done = () => {
      window.clearTimeout(timer);
      resolve();
    };

    const s = document.createElement('script');
    // autoload=false: 스크립트 로드와 SDK 초기화를 분리한다. kakao.maps.load 로 직접 켠다.
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_KEY}&autoload=false`;
    s.onload = () => window.kakao.maps.load(done);
    s.onerror = () => {
      window.clearTimeout(timer);
      reject(new MapError('map.loadFailed'));
    };
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

    const marker = (p: MapPoint, pin: Pin, zIndex: number) =>
      new m.Marker({
        position: new m.LatLng(p.lat, p.lng),
        map,
        title: p.name,
        zIndex,
        image: new m.MarkerImage(pin.url, new m.Size(pin.width, pin.height), {
          offset: new m.Point(pin.anchorX, pin.anchorY),
        }),
      });

    let anchorMarker = marker(point, buildPin(point.name), PIN_Z.primary);
    let nearby: RemovableMarker[] = [];
    let restore: (() => void) | undefined;

    const info = new m.InfoWindow({ content: '', removable: true });
    m.event.addListener(map, 'click', () => info.close());

    return {
      refresh: () => {
        map.relayout();
        map.setCenter(center);
      },
      recenter: () => {
        if (restore) {
          restore();
          return;
        }
        map.setCenter(center);
        map.setLevel(KAKAO_LEVEL);
      },
      setNearby: (points) => {
        info.close();
        nearby.forEach((mk) => mk.setMap(null));

        // 같은 건물에 몰린 핀을 벌려 놓는다(안 그러면 아래 것을 못 누른다).
        const spread = spreadOverlaps(point, points);

        // 곁들임이 있으면 기준 병원은 뒤로 물린다 — 이 지도의 주인공은 후보들이다.
        anchorMarker.setMap(null);
        anchorMarker = marker(
          point,
          points.length > 0 ? buildAnchorPin() : buildPin(point.name),
          points.length > 0 ? PIN_Z.anchor : PIN_Z.primary,
        );

        nearby = spread.map((p, i) => {
          const mk = marker(p, buildRankPin(p.rank ?? i + 1), PIN_Z.rank);
          m.event.addListener(mk, 'click', () => {
            // 누른 핀을 가운데로 옮긴다. **말풍선이 잘리는 걸 막는 가장 싼 방법**이다 —
            // 지도 컨테이너가 overflow-hidden 이라 가장자리에서 열리면 잘리고,
            // 왼쪽 위는 크게보기·현위치 버튼이 덮는다. 가운데면 둘 다 피한다.
            map.setCenter(new m.LatLng(p.lat, p.lng));
            info.setContent(infoContent(p));
            info.open(map, mk);
          });
          return mk;
        });

        const box = symmetricBounds(point, spread);
        if (!box) {
          restore = undefined;
          return;
        }
        const bounds = new m.LatLngBounds();
        bounds.extend(new m.LatLng(box.sw.lat, box.sw.lng));
        bounds.extend(new m.LatLng(box.ne.lat, box.ne.lng));
        restore = () => map.setBounds(bounds as object);
        restore();
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

    const marker = (p: MapPoint, pin: Pin, zIndex: number) =>
      new m.Marker({
        position: { lat: p.lat, lng: p.lng },
        map,
        title: p.name,
        zIndex,
        icon: {
          url: pin.url,
          scaledSize: new m.Size(pin.width, pin.height),
          anchor: new m.Point(pin.anchorX, pin.anchorY),
        },
      });

    let anchorMarker = marker(point, buildPin(point.name), PIN_Z.primary);
    let nearby: RemovableMarker[] = [];
    let restore: (() => void) | undefined;

    const info = new m.InfoWindow({ content: '' });
    map.addListener('click', () => info.close());

    return {
      refresh: () => {
        m.event.trigger(map, 'resize');
        map.setCenter(center);
      },
      recenter: () => {
        if (restore) {
          restore();
          return;
        }
        map.setCenter(center);
        map.setZoom(17);
      },
      setNearby: (points) => {
        info.close();
        nearby.forEach((mk) => mk.setMap(null));

        // 같은 건물에 몰린 핀을 벌려 놓는다(안 그러면 아래 것을 못 누른다).
        const spread = spreadOverlaps(point, points);

        // 곁들임이 있으면 기준 병원은 뒤로 물린다 — 이 지도의 주인공은 후보들이다.
        anchorMarker.setMap(null);
        anchorMarker = marker(
          point,
          points.length > 0 ? buildAnchorPin() : buildPin(point.name),
          points.length > 0 ? PIN_Z.anchor : PIN_Z.primary,
        );

        nearby = spread.map((p, i) => {
          const mk = marker(p, buildRankPin(p.rank ?? i + 1), PIN_Z.rank);
          mk.addListener('click', () => {
            // 누른 핀을 가운데로 옮긴다. **말풍선이 잘리는 걸 막는 가장 싼 방법**이다 —
            // 지도 컨테이너가 overflow-hidden 이라 가장자리에서 열리면 잘리고,
            // 왼쪽 위는 크게보기·현위치 버튼이 덮는다. 가운데면 둘 다 피한다.
            map.setCenter({ lat: p.lat, lng: p.lng });
            info.setContent(infoContent(p));
            info.open({ map, anchor: mk });
          });
          return mk;
        });

        const box = symmetricBounds(point, spread);
        if (!box) {
          restore = undefined;
          return;
        }
        const bounds = new m.LatLngBounds();
        bounds.extend(box.sw);
        bounds.extend(box.ne);
        restore = () => map.fitBounds(bounds as object);
        restore();
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
