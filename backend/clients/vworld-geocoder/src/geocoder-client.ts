import { getCoord } from './generated/coord/coord';
import type {
  CoordResponse,
  GetCoordParams,
  RefinedAddress,
} from './generated/coord/model';
import { getAddress } from './generated/address/address';
import type { AddressItem, GetAddressParams } from './generated/address/model';
import { VworldConfig } from './http';
import { withVworldConfig } from './mutator';

/** 오퍼레이션 이름. 경로가 같아 request 파라미터로만 갈린다. */
const OP_COORD = 'GetCoord';
const OP_ADDRESS = 'GetAddress';

/** 주소 → 좌표 결과. 못 찾으면 null 이다. */
export interface Coordinate {
  /** 경도 */
  lon: number;
  /** 위도 */
  lat: number;
  /** 응답 좌표계. 요청한 crs 그대로다. */
  crs: string;
  /** 정제된 주소. refine=false 거나 simple=true 면 비어 있을 수 있다. */
  refined?: RefinedAddress;
}

/**
 * 브이월드 지오코딩 클라이언트.
 *
 * **응답에서 손대는 건 두 가지뿐이다.**
 *   1. `response` 래퍼를 벗긴다. 가이드에 없는 한 겹이라 호출부가 매번 더듬을 이유가 없다.
 *   2. 좌표를 숫자로 바꾼다. 원본이 문자열로 준다.
 * 나머지 필드는 원본 그대로다(`level1`, `level4AC` …).
 *
 * **NOT_FOUND 는 예외가 아니라 null 이다.** "그 주소를 못 찾았다"는 정상 결과다.
 * 인증 실패·한도 초과·파라미터 오류만 예외로 던진다(VworldError 계열).
 *
 * 일일 한도 40,000건. 병렬 호출은 호출부에서 제어하라.
 */
export class VworldGeocoderClient {
  constructor(private readonly config: VworldConfig) {}

  /**
   * 주소 → 좌표.
   *
   * `type` 과 주소 형태가 어긋나면 NOT_FOUND 다 — 도로명 주소에 PARCEL 을 주면 못 찾는다.
   * 기본값을 두지 않는 이유다. 호출부가 어떤 주소인지 알고 있어야 한다.
   */
  async geocode(params: GetCoordParams): Promise<Coordinate | null> {
    const { data } = await getCoord(
      params,
      withVworldConfig(this.config, OP_COORD),
    );
    return toCoordinate(data);
  }

  /**
   * 좌표 → 주소. 사용자 위치로 시도·시군구를 알아낼 때 쓴다.
   *
   * **`point` 는 '경도,위도' 순이다.** 위경도 순서가 아니다.
   * type=BOTH(기본)면 지번·도로명 두 건이 배열로 온다. 못 찾으면 빈 배열이다.
   */
  async reverseGeocode(params: GetAddressParams): Promise<AddressItem[]> {
    const { data } = await getAddress(
      params,
      withVworldConfig(this.config, OP_ADDRESS),
    );
    return data.response?.result ?? [];
  }

  /** 좌표를 'x,y' 문자열로 만든다. 순서를 헷갈리지 않게 하는 도우미다. */
  static toPoint(lon: number, lat: number): string {
    return `${lon},${lat}`;
  }
}

/** 좌표 응답을 편다. 문자열로 오는 좌표를 숫자로 바꾼다. */
function toCoordinate(data: CoordResponse): Coordinate | null {
  const response = data.response;
  if (response?.status !== 'OK') {
    return null;
  }

  const point = response.result?.point;
  const lon = Number(point?.x);
  const lat = Number(point?.y);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    return null;
  }

  return {
    lon,
    lat,
    crs: response.result?.crs ?? '',
    refined: response.refined,
  };
}
