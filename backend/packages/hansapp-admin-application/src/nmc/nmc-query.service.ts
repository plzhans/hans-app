import { Inject, Injectable } from '@nestjs/common';
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
  NmcClient,
} from '@krdata/nmc';

import { NMC_CLIENT } from '../krdata.providers';

/**
 * NMC 공공데이터 API 를 직접 조회한다. DB 를 거치지 않고 원본을 그대로 확인하는 용도다.
 *
 * 외부 API 호출은 이 계층이 소유한다. CLI 는 커맨드 파싱과 출력만 담당하고
 * SDK 를 직접 잡지 않는다. 그래야 나중에 admin-server 가 같은 기능을 HTTP 로 노출할 때
 * 로직을 옮기지 않아도 된다.
 *
 * 응답은 가공하지 않고 원본 그대로 넘긴다.
 */
@Injectable()
export class NmcQueryService {
  constructor(@Inject(NMC_CLIENT) private readonly client: NmcClient) {}

  getHospitalList(
    params: GetHospitalListParams = {},
  ): Promise<HospitalListResponse> {
    return this.client.getHospitalList(params);
  }

  getHospitalLocations(
    params: GetHospitalLocationListParams,
  ): Promise<HospitalLocationResponse> {
    return this.client.getHospitalLocations(params);
  }

  getHospitalBasisInfo(
    hpid: string,
    params: Omit<GetHospitalBasisInfoParams, 'HPID'> = {},
  ): Promise<HospitalBasisInfoResponse> {
    return this.client.getHospitalBasisInfo(hpid, params);
  }

  getHospitalFullDown(
    params: GetHospitalFullDownParams = {},
  ): Promise<HospitalFullDownResponse> {
    return this.client.getHospitalFullDown(params);
  }

  getBabyHospitalList(
    params: GetBabyHospitalListParams = {},
  ): Promise<BabyHospitalListResponse> {
    return this.client.getBabyHospitalList(params);
  }

  getBabyHospitalLocations(
    params: GetBabyHospitalLocationListParams,
  ): Promise<BabyHospitalLocationResponse> {
    return this.client.getBabyHospitalLocations(params);
  }

  getCodeList(params: GetCodeInfoListParams = {}): Promise<CodeInfoResponse> {
    return this.client.getCodeList(params);
  }
}
