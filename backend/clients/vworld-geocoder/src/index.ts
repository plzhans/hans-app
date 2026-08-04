export * from './geocoder-client';
export { VWORLD_BASE_URL } from './http';
export type { VworldConfig } from './http';
export { VworldError, VworldQuotaError, VworldAuthError } from './error';
export type * from './generated/coord/model';
// 두 스펙에 같은 이름이 복제돼 있다(AddressStructure·ErrorInfo·ServiceInfo·Status).
// star export 만으로는 모호해지므로 역지오코딩 고유 타입만 명시해 가져온다.
export type {
  AddressResponse,
  AddressResult,
  AddressItem,
  GetAddressParams,
} from './generated/address/model';
