import {
  getBabyHospitalList,
  getBabyHospitalLocationList,
  getCodeInfoList,
  getHospitalBasisInfo,
  getHospitalFullDown,
  getHospitalList,
  getHospitalLocationList,
} from './generated/nmc';
import type {
  BabyHospitalListResponse,
  BabyHospitalLocationResponse,
  CodeInfoResponse,
  GetBabyHospitalListParams,
  GetBabyHospitalLocationListParams,
  GetCodeInfoListParams,
  GetHospitalBasisInfoParams,
  GetHospitalFullDownParams,
  GetHospitalListParams,
  GetHospitalLocationListParams,
  HospitalBasisInfoResponse,
  HospitalFullDownResponse,
  HospitalListResponse,
  HospitalLocationResponse,
} from './generated/model';
import { parseNmcRegion } from './address';
import { NmcConfig, withKrDataConfig } from './mutator';

/** 주소를 가진 item. 지역 파생 필드가 붙는 대상이다. */
interface AddressItem {
  dutyAddr?: string;
  sidoNm?: string;
  sgguNm?: string;
}

/** 주소를 가진 item 목록을 담은 응답. 오퍼레이션마다 item 타입만 다르고 봉투는 같다. */
interface AddressResponse {
  response?: { body?: { items?: { item?: AddressItem[] } } };
}

/**
 * 응답의 각 item 에 시도·시군구를 채운다.
 *
 * NMC 는 지역을 코드로 주지 않으므로(주소 문자열뿐) SDK 가 여기서 한 번 계산해 넣는다.
 * 그래야 뒤쪽(sync·DB·조회)이 지역 계산을 몰라도 되고, HIRA(sidoCd 를 직접 주는)와
 * 같은 모양으로 다룰 수 있다. 파생 필드라는 사실은 openapi 스펙의 필드 설명에 명시했다.
 */
function fillRegion<T extends AddressResponse>(response: T): T {
  for (const item of response.response?.body?.items?.item ?? []) {
    Object.assign(item, parseNmcRegion(item.dutyAddr));
  }
  return response;
}

/**
 * 국립중앙의료원(NMC) 전국 병·의원 찾기 서비스 클라이언트.
 *
 * API 응답을 그대로 반환한다. 별도의 응답 구조를 만들지 않는다.
 * `items` 가 빈 문자열로 오거나 `item` 이 단일 객체로 오는 것만 배열로 보정한다. (@krdata/core)
 *
 * 예외가 하나 있다. 주소를 가진 item 에는 시도·시군구(sidoNm/sgguNm)를 계산해 채운다.
 * 원본이 지역을 코드로 주지 않아 검색·집계가 불가능하기 때문이다. (address.ts 참고)
 *
 * 초당 최대 30 TPS 제한이 있다. 병렬 호출은 호출부에서 제어하라.
 */
export class NmcClient {
  constructor(private readonly config: NmcConfig) {}

  /** 병·의원 목록정보 조회 (주소·진료과목 등으로 필터) */
  async getHospitalList(
    params: GetHospitalListParams = {},
  ): Promise<HospitalListResponse> {
    const { data } = await getHospitalList(
      params,
      withKrDataConfig(this.config),
    );
    return fillRegion(data);
  }

  /** 병·의원 위치정보 조회 (위경도 기준 거리순) */
  async getHospitalLocations(
    params: GetHospitalLocationListParams,
  ): Promise<HospitalLocationResponse> {
    const { data } = await getHospitalLocationList(
      params,
      withKrDataConfig(this.config),
    );
    return fillRegion(data);
  }

  /** 병·의원별 기본정보 조회 */
  async getHospitalBasisInfo(
    hpid: string,
    params: Omit<GetHospitalBasisInfoParams, 'HPID'> = {},
  ): Promise<HospitalBasisInfoResponse> {
    const { data } = await getHospitalBasisInfo(
      { ...params, HPID: hpid },
      withKrDataConfig(this.config),
    );
    return fillRegion(data);
  }

  /** 달빛어린이병원 및 소아전문센터 목록정보 조회 */
  async getBabyHospitalList(
    params: GetBabyHospitalListParams = {},
  ): Promise<BabyHospitalListResponse> {
    const { data } = await getBabyHospitalList(
      params,
      withKrDataConfig(this.config),
    );
    return fillRegion(data);
  }

  /** 달빛어린이병원 위치정보 조회 (위경도 기준 거리순) */
  async getBabyHospitalLocations(
    params: GetBabyHospitalLocationListParams,
  ): Promise<BabyHospitalLocationResponse> {
    const { data } = await getBabyHospitalLocationList(
      params,
      withKrDataConfig(this.config),
    );
    return fillRegion(data);
  }

  /** 병/의원 FullData 내려받기 (배치 적재용) */
  async getHospitalFullDown(
    params: GetHospitalFullDownParams = {},
  ): Promise<HospitalFullDownResponse> {
    const { data } = await getHospitalFullDown(
      params,
      withKrDataConfig(this.config),
    );
    return fillRegion(data);
  }

  /** 코드마스터 목록 조회 */
  async getCodeList(
    params: GetCodeInfoListParams = {},
  ): Promise<CodeInfoResponse> {
    const { data } = await getCodeInfoList(
      params,
      withKrDataConfig(this.config),
    );
    return data;
  }

  /**
   * FullData 를 페이지 단위로 끝까지 순회한다. 배치 적재용.
   * 각 페이지의 응답을 원본 그대로 넘긴다.
   *
   * 데이터 갱신주기가 일 1회이므로 배치도 하루 한 번이면 충분하다.
   * 30 TPS 제한이 있으니 호출 간격 제어가 필요하면 호출부에서 처리하라.
   */
  async *paginateHospitalFullDown(
    numOfRows = 10_000,
  ): AsyncGenerator<HospitalFullDownResponse> {
    let pageNo = 1;
    let fetched = 0;

    for (;;) {
      const response = await this.getHospitalFullDown({ pageNo, numOfRows });

      const body = response.response?.body;
      const items = body?.items?.item ?? [];
      if (items.length === 0) {
        return;
      }

      yield response;

      fetched += items.length;
      if (fetched >= (body?.totalCount ?? 0)) {
        return;
      }
      pageNo += 1;
    }
  }
}
