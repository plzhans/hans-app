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

  /**
   * 이 지점이 무엇인가(병원 id). 말풍선을 눌렀을 때 화면 쪽이 **어느 카드인지 찾는 단서**다.
   * 지도 어댑터는 그 id 로 무엇을 할지 모르고, 알 필요도 없다 — 그대로 되돌려줄 뿐이다.
   */
  id?: string;
}

/** 생성된 지도를 조종하는 손잡이. 크게보기/현위치 버튼이 이걸 부른다. */
export interface MapController {
  /** 컨테이너 크기가 바뀐 뒤 다시 그린다(+ 핀을 가운데로). 확대율은 건드리지 않는다. */
  refresh(): void;
  /** 병원 위치로 되돌린다(+ 기본 확대율). */
  recenter(): void;
  /**
   * 곁들임 핀(근처의 비슷한 병원·검색 결과)을 갈아 끼운다. 이전 것은 지운다.
   *
   * **생성(create)이 아니라 별도 메서드인 이유**는 이 목록이 지도보다 늦게 도착할 수 있어서다 —
   * 지도는 사용자가 "지도 보기" 를 누르는 순간 만들어지는데, 그때 근처 병원 조회가 아직
   * 안 끝났을 수 있다. 지도를 다시 만들면 SDK 호출이 또 오르므로(과금) 핀만 얹는다.
   *
   * @param opts.onSelect **말풍선**을 눌렀을 때. MapPoint.id 를 그대로 돌려준다.
   *   핀 자체는 말풍선을 여는 데까지만 쓴다 — 지도를 훑는 동안 핀은 자주 스치듯 눌리는데,
   *   그때마다 화면이 목록으로 끌려가면 정작 지도를 볼 수가 없다. 이름을 확인하고 나서
   *   그 이름을 누르는 것이 "이걸 고른다" 는 뜻이 된다.
   * @param opts.anchor 기준 병원 핀을 그릴지. **검색 결과 지도에는 기준이 없다** —
   *   상세에서는 "이 병원 주변" 이라 가운데 병원이 실재하지만, 검색은 결과 목록일 뿐이라
   *   가운데에 아무 뜻 없는 회색 점이 하나 남는다. 그럴 때 끈다(기본은 그린다).
   * @param opts.fit 핀이 다 들어오게 확대율을 맞출지(기본 true).
   *
   *   **지도 영역으로 검색한 뒤에는 끈다.** 사용자가 자리를 정해서 검색한 것인데 결과에
   *   맞춰 다시 확대율을 잡으면 방금 고른 자리에서 지도가 밀려난다 — 누른 대가가 화면이
   *   엉뚱한 데로 가는 것이 된다. 그때는 핀만 갈아 끼우고 지도는 그대로 둔다.
   *
   *   꺼도 "현위치" 버튼(recenter)은 여전히 결과 전체가 보이는 자리로 돌아간다 —
   *   되돌릴 자리는 계산해 두고 지금 옮기지만 않는 것이다.
   */
  setNearby(
    points: MapPoint[],
    opts?: { anchor?: boolean; onSelect?: (id: string) => void; fit?: boolean },
  ): void;

  /**
   * **사용자가** 지도를 옮긴 뒤의 보이는 영역을 알린다("이 지역에서 검색" 재료).
   * 구독을 끊는 함수를 돌려준다.
   *
   * **우리가 옮긴 것은 안 알린다.** 검색 결과에 맞춰 확대율을 맞추는 것(setNearby 의
   * fitBounds)도 지도를 움직이지만, 그건 사용자가 한 일이 아니다 — 그것까지 알리면
   * 검색할 때마다 "이 지역에서 검색" 버튼이 스스로 튀어나온다.
   *
   * 손짓이 끝난 뒤에 한 번만 부른다(끄는 동안 매 프레임이 아니라). 영역은 손을 떼야
   * 확정되고, 그 사이 매번 알려봐야 받는 쪽이 버릴 값이다.
   */
  watchBounds(listener: (bounds: MapBounds) => void): () => void;
}

/** 지도에 보이는 영역. 검색 API 의 bbox 와 같은 모양이다. */
export interface MapBounds {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

/**
 * 영역 알림을 관리하는 공통 살림. 세 플랫폼이 이벤트 이름만 다르고 나머지는 같다.
 *
 * **우리가 지도를 옮기는 동안은 알림을 끈다**(suppress). fitBounds 는 비동기로 애니메이션
 * 하며 여러 이벤트를 뱉으므로, 다 가라앉을 때까지 시간을 두고 다시 켠다.
 */
function boundsNotifier() {
  let listener: ((bounds: MapBounds) => void) | undefined;
  let suppressed = false;
  let timer: number | undefined;

  /**
   * 사용자가 지도를 건드렸는가. **시간만으로는 못 가른다.**
   *
   * 처음엔 억제 시간(PROGRAMMATIC_MOVE_SETTLE_MS)만으로 막았는데, 타일이 늦게 오는 등으로
   * idle 이 그 창을 넘겨 오면 우리가 맞춘 확대율이 사용자 동작으로 읽혔다 — 아무것도 안
   * 건드렸는데 "이 지역에서 검색" 이 혼자 떠 있는 상태가 된다.
   *
   * 그래서 **손짓이 있었을 때만 문을 연다.** 끌기·확대는 사용자만 하는 일이고(arm),
   * 우리가 옮기는 동안에는 그 문마저 안 열린다(suppressed 확인) — fitBounds 도 확대율을
   * 바꾸므로 그 구분이 없으면 우리 동작이 스스로 문을 열어버린다.
   */
  let armed = false;

  return {
    watch(next: (bounds: MapBounds) => void) {
      listener = next;
      return () => {
        if (listener === next) listener = undefined;
      };
    },
    /** 사용자 손짓(끌기 끝·확대율 변경)에 건다. */
    arm() {
      if (!suppressed) armed = true;
    },
    /** 우리가 지도를 옮기기 직전에 부른다. 가라앉을 때까지 알림을 막는다. */
    suppress() {
      suppressed = true;
      armed = false;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        suppressed = false;
      }, PROGRAMMATIC_MOVE_SETTLE_MS);
    },
    emit(bounds: MapBounds | undefined) {
      if (suppressed || !armed || !bounds || !listener) return;
      listener(bounds);
    },
  };
}

/**
 * 우리가 옮긴 지도가 가라앉기를 기다리는 시간(ms).
 *
 * fitBounds 는 애니메이션이라 끝나는 시점을 알려주지 않는다 — 넉넉히 잡는다. 짧으면
 * 애니메이션 끝자락의 이벤트가 사용자 동작으로 잘못 읽혀 버튼이 스스로 뜨고, 길면
 * 그만큼 실제 손짓을 놓치는데 **후자가 훨씬 덜 나쁘다**(다시 끌면 그만이다).
 */
const PROGRAMMATIC_MOVE_SETTLE_MS = 600;

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
const PIN_Z = {
  /**
   * 말풍선. **핀 전부보다 위다.**
   *
   * 지정하지 않으면 SDK 기본값이라, 나중에 만들어진 핀이 말풍선을 덮는다 — 핀이 몰려 있는
   * 자리에서 이름을 열면 옆 핀에 가려 정작 무엇을 눌렀는지 못 읽는다. 말풍선은 사용자가
   * **직접 열어 지금 보고 있는 것**이라 언제나 맨 위여야 한다.
   */
  info: 1000,
  primary: 100,
  rank: 50,
  anchor: 10,
} as const;

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
  const escape = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const name = escape(point.name);
  const rank =
    point.rank === undefined
      ? ''
      : `<span style="display:inline-flex;align-items:center;justify-content:center;` +
        `width:18px;height:18px;margin-right:6px;border-radius:5px;` +
        `background:${rankMark(point.rank).solid};color:#fff;font-size:11px;font-weight:700">` +
        `${rankLabel(point.rank)}</span>`;

  const inner =
    `display:flex;align-items:center;white-space:nowrap;` +
    `padding:7px 11px;font-size:13px;font-weight:600;color:#0f172a;` +
    `font-family:-apple-system,BlinkMacSystemFont,sans-serif`;

  /*
    id 가 있으면 **누를 수 있는 것**으로 만든다. 링크(`<a href>`)가 아니라 버튼인 이유는
    이게 페이지를 옮기는 일이 아니기 때문이다 — 아래 목록의 그 카드로 데려갈 뿐이라,
    링크로 두면 새 탭·주소 미리보기 같은 "다른 데로 간다" 는 신호를 거짓으로 준다.
  */
  if (!point.id) {
    return `<div style="${inner}">${rank}${name}</div>`;
  }
  return (
    `<button type="button" data-map-select="${escape(point.id)}" ` +
    `style="${inner};border:0;background:none;cursor:pointer">${rank}${name}</button>`
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

/**
 * 점들을 **딱 감싸는** 사각형. 기준점이 없는 지도(검색 결과)가 쓴다.
 *
 * symmetricBounds 와 다른 점은 가운데를 고정하지 않는다는 것이다. 그쪽은 "이 병원 주변" 이라
 * 기준 병원이 한가운데 있어야 하지만, 검색 결과에는 가운데를 지킬 이유가 없다 — 대칭으로
 * 잡으면 **첫 결과가 한쪽에 치우쳐 있을 때 상자가 두 배로 커져** 지도가 쓸데없이 멀어진다.
 *
 * 여백은 폭·높이의 8% 다. 핀이 가장자리에 딱 붙지 않을 만큼만 준다.
 * 점이 하나뿐이면(또는 모두 같은 자리면) 폭이 0 이라, 최소 여백으로 그 언저리를 보여준다.
 */
function fitBounds(
  points: MapPoint[],
): { sw: { lat: number; lng: number }; ne: { lat: number; lng: number } } | undefined {
  if (points.length === 0) return undefined;

  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  // 약 150m. 한 점만 있을 때 동네가 보일 정도의 최소 반경이다.
  const MIN_PAD = 0.0015;
  const padLat = Math.max((maxLat - minLat) * 0.08, MIN_PAD);
  const padLng = Math.max((maxLng - minLng) * 0.08, MIN_PAD);

  return {
    sw: { lat: minLat - padLat, lng: minLng - padLng },
    ne: { lat: maxLat + padLat, lng: maxLng + padLng },
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

/**
 * 지도에 보이는 영역. **세 SDK 가 모서리를 꺼내는 이름이 다 다르다** —
 * 네이버는 getSW/getNE, 카카오·구글은 getSouthWest/getNorthEast 다.
 * 좌표를 꺼내는 방법도 다르다(네이버·카카오는 lat()/lng() 메서드, 카카오 LatLng 은 getLat()).
 */
interface NaverLatLngBounds {
  getSW: () => { lat: () => number; lng: () => number };
  getNE: () => { lat: () => number; lng: () => number };
}

interface KakaoLatLngBounds {
  getSouthWest: () => { getLat: () => number; getLng: () => number };
  getNorthEast: () => { getLat: () => number; getLng: () => number };
}

interface GoogleLatLngBounds {
  getSouthWest: () => { lat: () => number; lng: () => number };
  getNorthEast: () => { lat: () => number; lng: () => number };
}

interface NaverMapInstance {
  refresh: (noEffect?: boolean) => void;
  panTo: (coord: object, opts?: object) => void;
  setZoom: (zoom: number, effect?: boolean) => void;
  fitBounds: (bounds: object) => void;
  getBounds: () => NaverLatLngBounds | undefined;
}

interface KakaoMapInstance {
  relayout: () => void;
  setCenter: (latlng: object) => void;
  setLevel: (level: number) => void;
  addControl: (control: object, position: unknown) => void;
  setBounds: (bounds: object) => void;
  getBounds: () => KakaoLatLngBounds | undefined;
}

interface GoogleMapInstance {
  setCenter: (latlng: object) => void;
  setZoom: (zoom: number) => void;
  fitBounds: (bounds: object) => void;
  addListener: (type: string, handler: () => void) => void;
  getBounds: () => GoogleLatLngBounds | undefined;
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

    let anchorMarker: RemovableMarker | undefined = marker(
      point,
      buildPin(point.name),
      PIN_Z.primary,
    );
    let nearby: RemovableMarker[] = [];
    let restore: (() => void) | undefined;

    // 말풍선은 하나만 만들어 돌려 쓴다 — 핀마다 만들면 여러 개가 동시에 떠 지도를 덮는다.
    const info = new m.InfoWindow({ content: '', borderWidth: 0, zIndex: PIN_Z.info });
    m.Event.addListener(map, 'click', () => info.close());

    /*
      영역 알림. **idle 에 건다** — 끄는 중·확대 중에는 계속 바뀌고, 손을 떼야 확정된다.
      우리가 옮긴 것인지는 notifier 가 가른다(setNearby 가 suppress 를 부른다).
    */
    const boundsWatcher = boundsNotifier();
    m.Event.addListener(map, 'dragend', () => boundsWatcher.arm());
    m.Event.addListener(map, 'zoom_changed', () => boundsWatcher.arm());
    m.Event.addListener(map, 'idle', () => {
      const b = map.getBounds();
      if (!b) return;
      const sw = b.getSW();
      const ne = b.getNE();
      boundsWatcher.emit({
        minLat: sw.lat(),
        minLon: sw.lng(),
        maxLat: ne.lat(),
        maxLon: ne.lng(),
      });
    });

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
      setNearby: (points, opts) => {
        info.close();
        nearby.forEach((mk) => mk.setMap(null));

        // 같은 건물에 몰린 핀을 벌려 놓는다(안 그러면 아래 것을 못 누른다).
        const spread = spreadOverlaps(point, points);

        // 곁들임이 있으면 기준 병원은 뒤로 물린다 — 이 지도의 주인공은 후보들이다.
        // anchor:false 면 아예 안 그린다(검색 결과 지도 — 가운데에 기준이 없다).
        anchorMarker?.setMap(null);
        anchorMarker =
          opts?.anchor === false
            ? undefined
            : marker(
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
        // 기준점이 없으면(검색 결과) 점들을 딱 감싼다. 있으면 기준점을 가운데 두고 대칭으로.
        const box =
          opts?.anchor === false
            ? fitBounds(spread)
            : symmetricBounds(point, spread);
        if (!box) {
          restore = undefined;
          return;
        }
        const mapBounds = new m.LatLngBounds(
          new m.LatLng(box.sw.lat, box.sw.lng),
          new m.LatLng(box.ne.lat, box.ne.lng),
        );
        restore = () => {
          // 우리가 옮기는 것이다 — 알리지 않는다(안 그러면 검색할 때마다 버튼이 뜬다).
          boundsWatcher.suppress();
          map.fitBounds(mapBounds);
        };
        if (opts?.fit !== false) restore();
      },
      watchBounds: (listener) => boundsWatcher.watch(listener),
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

    let anchorMarker: RemovableMarker | undefined = marker(
      point,
      buildPin(point.name),
      PIN_Z.primary,
    );
    let nearby: RemovableMarker[] = [];
    let restore: (() => void) | undefined;

    const info = new m.InfoWindow({ content: '', removable: true, zIndex: PIN_Z.info });
    m.event.addListener(map, 'click', () => info.close());

    // 영역 알림. idle 에 거는 이유·suppress 규칙은 네이버 쪽 주석 참고.
    const boundsWatcher = boundsNotifier();
    m.event.addListener(map, 'dragend', () => boundsWatcher.arm());
    m.event.addListener(map, 'zoom_changed', () => boundsWatcher.arm());
    m.event.addListener(map, 'idle', () => {
      const b = map.getBounds();
      if (!b) return;
      const sw = b.getSouthWest();
      const ne = b.getNorthEast();
      boundsWatcher.emit({
        minLat: sw.getLat(),
        minLon: sw.getLng(),
        maxLat: ne.getLat(),
        maxLon: ne.getLng(),
      });
    });

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
      setNearby: (points, opts) => {
        info.close();
        nearby.forEach((mk) => mk.setMap(null));

        // 같은 건물에 몰린 핀을 벌려 놓는다(안 그러면 아래 것을 못 누른다).
        const spread = spreadOverlaps(point, points);

        // 곁들임이 있으면 기준 병원은 뒤로 물린다 — 이 지도의 주인공은 후보들이다.
        // anchor:false 면 아예 안 그린다(검색 결과 지도 — 가운데에 기준이 없다).
        anchorMarker?.setMap(null);
        anchorMarker =
          opts?.anchor === false
            ? undefined
            : marker(
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

        // 기준점이 없으면(검색 결과) 점들을 딱 감싼다. 있으면 기준점을 가운데 두고 대칭으로.
        const box =
          opts?.anchor === false
            ? fitBounds(spread)
            : symmetricBounds(point, spread);
        if (!box) {
          restore = undefined;
          return;
        }
        const mapBounds = new m.LatLngBounds();
        mapBounds.extend(new m.LatLng(box.sw.lat, box.sw.lng));
        mapBounds.extend(new m.LatLng(box.ne.lat, box.ne.lng));
        restore = () => {
          boundsWatcher.suppress();
          map.setBounds(mapBounds as object);
        };
        if (opts?.fit !== false) restore();
      },
      watchBounds: (listener) => boundsWatcher.watch(listener),
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

    let anchorMarker: RemovableMarker | undefined = marker(
      point,
      buildPin(point.name),
      PIN_Z.primary,
    );
    let nearby: RemovableMarker[] = [];
    let restore: (() => void) | undefined;

    const info = new m.InfoWindow({ content: '', zIndex: PIN_Z.info });
    map.addListener('click', () => info.close());

    // 영역 알림. idle 에 거는 이유·suppress 규칙은 네이버 쪽 주석 참고.
    const boundsWatcher = boundsNotifier();
    map.addListener('dragend', () => boundsWatcher.arm());
    map.addListener('zoom_changed', () => boundsWatcher.arm());
    map.addListener('idle', () => {
      const b = map.getBounds();
      if (!b) return;
      const sw = b.getSouthWest();
      const ne = b.getNorthEast();
      boundsWatcher.emit({
        minLat: sw.lat(),
        minLon: sw.lng(),
        maxLat: ne.lat(),
        maxLon: ne.lng(),
      });
    });

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
      setNearby: (points, opts) => {
        info.close();
        nearby.forEach((mk) => mk.setMap(null));

        // 같은 건물에 몰린 핀을 벌려 놓는다(안 그러면 아래 것을 못 누른다).
        const spread = spreadOverlaps(point, points);

        // 곁들임이 있으면 기준 병원은 뒤로 물린다 — 이 지도의 주인공은 후보들이다.
        // anchor:false 면 아예 안 그린다(검색 결과 지도 — 가운데에 기준이 없다).
        anchorMarker?.setMap(null);
        anchorMarker =
          opts?.anchor === false
            ? undefined
            : marker(
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

        // 기준점이 없으면(검색 결과) 점들을 딱 감싼다. 있으면 기준점을 가운데 두고 대칭으로.
        const box =
          opts?.anchor === false
            ? fitBounds(spread)
            : symmetricBounds(point, spread);
        if (!box) {
          restore = undefined;
          return;
        }
        const mapBounds = new m.LatLngBounds();
        mapBounds.extend(box.sw);
        mapBounds.extend(box.ne);
        restore = () => {
          boundsWatcher.suppress();
          map.fitBounds(mapBounds as object);
        };
        if (opts?.fit !== false) restore();
      },
      watchBounds: (listener) => boundsWatcher.watch(listener),
    };
  },
};

/** 탭 순서 = 표시 순서. 기본은 첫 번째(네이버). */
export const MAP_ADAPTERS: readonly PlatformAdapter[] = [
  naverAdapter,
  kakaoAdapter,
  googleAdapter,
];
