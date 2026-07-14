/**
 * 주소(행정구역 분해) 공통 타입.
 * full: 세분화(sido/sigungu/dong/detail)가 안 된 출처는 원본 주소 전체를 여기에 담는다.
 * 다국어는 이 타입을 직접 ko 로 감싸지 않고, 소비처에서 LangText<PostalAddress> 로 감싼다.
 */
export interface PostalAddress {
  sido: string | null;
  sigungu: string | null;
  dong: string | null;
  detail: string | null;
  full: string | null;
}

/** 좌표(위경도) 공통 타입. 표현계층 GeoPointDto 와 짝을 이룬다. */
export interface GeoPoint {
  lat: number | null;
  lon: number | null;
}
