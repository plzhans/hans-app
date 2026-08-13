import { Inject, Injectable } from '@nestjs/common';
import type {
  AddressCodeResponse,
  DetailInfoResponse,
  EquipmentCodeResponse,
  EquipmentInfoResponse,
  EtcStaffInfoResponse,
  FacilityInfoResponse,
  FoodAddcInfoResponse,
  GetHospitalListParams,
  HiraClient,
  HospitalListResponse,
  InstitutionClassCodeResponse,
  NursingGradeInfoResponse,
  SearchCodeResponse,
  SpecialDiagnosisInfoResponse,
  SpecialistCountInfoResponse,
  SubjectCodeResponse,
  SubjectInfoResponse,
  TransportInfoResponse,
} from '@krdata/hira';

import { HIRA_CLIENT } from '../krdata.providers';

/** ykiho 기준 상세 조회의 공통 파라미터 */
export interface HiraPageParams {
  pageNo?: number;
  numOfRows?: number;
}

/**
 * HIRA 공공데이터 API 를 직접 조회한다. DB 를 거치지 않고 원본을 그대로 확인하는 용도다.
 *
 * 외부 API 호출은 이 계층이 소유한다. CLI 는 커맨드 파싱과 출력만 담당하고
 * SDK 를 직접 잡지 않는다.
 *
 * 응답은 가공하지 않고 원본 그대로 넘긴다.
 */
@Injectable()
export class HiraQueryService {
  constructor(@Inject(HIRA_CLIENT) private readonly client: HiraClient) {}

  // ── 병원정보서비스 ────────────────────────────────

  getHospitalList(params: GetHospitalListParams = {}): Promise<HospitalListResponse> {
    return this.client.getHospitalList(params);
  }

  // ── 의료기관별상세정보서비스 (ykiho 기준) ──────────

  getDetailInfo(ykiho: string, params: HiraPageParams = {}): Promise<DetailInfoResponse> {
    return this.client.getDetailInfo(ykiho, params);
  }

  getFacilityInfo(ykiho: string, params: HiraPageParams = {}): Promise<FacilityInfoResponse> {
    return this.client.getFacilityInfo(ykiho, params);
  }

  getSubjectInfo(ykiho: string, params: HiraPageParams = {}): Promise<SubjectInfoResponse> {
    return this.client.getSubjectInfo(ykiho, params);
  }

  getTransportInfo(ykiho: string, params: HiraPageParams = {}): Promise<TransportInfoResponse> {
    return this.client.getTransportInfo(ykiho, params);
  }

  getEquipmentInfo(ykiho: string, params: HiraPageParams = {}): Promise<EquipmentInfoResponse> {
    return this.client.getEquipmentInfo(ykiho, params);
  }

  getNursingGradeInfo(
    ykiho: string,
    params: HiraPageParams = {},
  ): Promise<NursingGradeInfoResponse> {
    return this.client.getNursingGradeInfo(ykiho, params);
  }

  getFoodAddcInfo(ykiho: string, params: HiraPageParams = {}): Promise<FoodAddcInfoResponse> {
    return this.client.getFoodAddcInfo(ykiho, params);
  }

  getSpecialDiagnosisInfo(
    ykiho: string,
    params: HiraPageParams = {},
  ): Promise<SpecialDiagnosisInfoResponse> {
    return this.client.getSpecialDiagnosisInfo(ykiho, params);
  }

  getSpecialtyHospitalFields(
    ykiho: string,
    params: HiraPageParams = {},
  ): Promise<SpecialDiagnosisInfoResponse> {
    return this.client.getSpecialtyHospitalFields(ykiho, params);
  }

  getSpecialistCounts(
    ykiho: string,
    params: HiraPageParams = {},
  ): Promise<SpecialistCountInfoResponse> {
    return this.client.getSpecialistCounts(ykiho, params);
  }

  getEtcStaffInfo(ykiho: string, params: HiraPageParams = {}): Promise<EtcStaffInfoResponse> {
    return this.client.getEtcStaffInfo(ykiho, params);
  }

  // ── 병원코드정보서비스 ────────────────────────────

  getAddressCodes(params: HiraPageParams = {}): Promise<AddressCodeResponse> {
    return this.client.getAddressCodes(params);
  }

  getInstitutionClassCodes(params: HiraPageParams = {}): Promise<InstitutionClassCodeResponse> {
    return this.client.getInstitutionClassCodes(params);
  }

  getSubjectCodes(params: HiraPageParams = {}): Promise<SubjectCodeResponse> {
    return this.client.getSubjectCodes(params);
  }

  getEquipmentCodes(params: HiraPageParams = {}): Promise<EquipmentCodeResponse> {
    return this.client.getEquipmentCodes(params);
  }

  getSpecialtyHospitalCodes(params: HiraPageParams = {}): Promise<SearchCodeResponse> {
    return this.client.getSpecialtyHospitalCodes(params);
  }

  getSpecialDiagnosisCodes(params: HiraPageParams = {}): Promise<SearchCodeResponse> {
    return this.client.getSpecialDiagnosisCodes(params);
  }
}
