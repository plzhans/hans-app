// 서비스 그룹별로 스펙을 나눴으므로 생성물도 그룹별 모듈에서 가져온다.
import { getHospitalList } from './generated/hosp-info/hosp-info';
import type {
  GetHospitalListParams,
  HospitalListResponse,
} from './generated/hosp-info/model';
import {
  getAddressCodeList,
  getEquipmentCodeList,
  getInstitutionClassCodeList,
  getSpecialDiagnosisCodeList,
  getSpecialtyHospitalCodeList,
  getSubjectCodeList,
} from './generated/code-info/code-info';
import type {
  AddressCodeResponse,
  EquipmentCodeResponse,
  InstitutionClassCodeResponse,
  SearchCodeResponse,
  SubjectCodeResponse,
} from './generated/code-info/model';
import {
  getDetailInfo,
  getEquipmentInfo,
  getEtcStaffInfo,
  getFacilityInfo,
  getFoodAddcInfo,
  getNursingGradeInfo,
  getSpecialDiagnosisInfo,
  getSpecialistCountInfo,
  getSpecialtyHospitalFieldList,
  getSubjectInfo,
  getTransportInfo,
} from './generated/madm-dtl/madm-dtl';
import type {
  DetailInfoResponse,
  EquipmentInfoResponse,
  EtcStaffInfoResponse,
  FacilityInfoResponse,
  FoodAddcInfoResponse,
  NursingGradeInfoResponse,
  SpecialDiagnosisInfoResponse,
  SpecialistCountInfoResponse,
  SubjectInfoResponse,
  TransportInfoResponse,
} from './generated/madm-dtl/model';
import { HiraConfig, withKrDataConfig } from './mutator';

/** ykiho 기준 상세 조회의 공통 파라미터 */
export interface DetailParams {
  pageNo?: number;
  numOfRows?: number;
}

/** 코드 조회의 공통 파라미터 */
export interface CodeParams {
  pageNo?: number;
  numOfRows?: number;
}

/**
 * 건강보험심사평가원(HIRA) API 클라이언트.
 *
 * API 응답을 그대로 반환한다. 별도의 응답 구조를 만들지 않는다.
 * `items` 가 빈 문자열로 오거나 `item` 이 단일 객체로 오는 것만 배열로 보정한다. (@krdata/core)
 *
 * 30 TPS 제한이 있고, 개발계정은 일 1,000건 트래픽 제한이 있다.
 * 병원이 79,739개라 ykiho 단위 상세 조회를 전량 수집하려면 운영계정이 사실상 필수다.
 */
export class HiraClient {
  constructor(private readonly config: HiraConfig) {}

  // ── 병원정보서비스 ────────────────────────────────

  /** 병원 기본목록. ykiho 를 여기서 얻어 상세 조회에 쓴다. */
  async getHospitalList(
    params: GetHospitalListParams = {},
  ): Promise<HospitalListResponse> {
    const { data } = await getHospitalList(
      params,
      withKrDataConfig(this.config),
    );
    return data;
  }

  // ── 병원코드정보서비스 ────────────────────────────

  /** 주소코드 (시도) */
  async getAddressCodes(params: CodeParams = {}): Promise<AddressCodeResponse> {
    const { data } = await getAddressCodeList(
      params,
      withKrDataConfig(this.config),
    );
    return data;
  }

  /** 의료기관종별코드 (clCd) */
  async getInstitutionClassCodes(
    params: CodeParams = {},
  ): Promise<InstitutionClassCodeResponse> {
    const { data } = await getInstitutionClassCodeList(
      params,
      withKrDataConfig(this.config),
    );
    return data;
  }

  /** 진료과목코드 (dgsbjtCd) */
  async getSubjectCodes(params: CodeParams = {}): Promise<SubjectCodeResponse> {
    const { data } = await getSubjectCodeList(
      params,
      withKrDataConfig(this.config),
    );
    return data;
  }

  /** 장비코드 (oftCd) */
  async getEquipmentCodes(
    params: CodeParams = {},
  ): Promise<EquipmentCodeResponse> {
    const { data } = await getEquipmentCodeList(
      params,
      withKrDataConfig(this.config),
    );
    return data;
  }

  /** 전문병원코드 */
  async getSpecialtyHospitalCodes(
    params: CodeParams = {},
  ): Promise<SearchCodeResponse> {
    const { data } = await getSpecialtyHospitalCodeList(
      params,
      withKrDataConfig(this.config),
    );
    return data;
  }

  /** 특수진료코드 */
  async getSpecialDiagnosisCodes(
    params: CodeParams = {},
  ): Promise<SearchCodeResponse> {
    const { data } = await getSpecialDiagnosisCodeList(
      params,
      withKrDataConfig(this.config),
    );
    return data;
  }

  // ── 의료기관별상세정보서비스 (ykiho 기준) ──────────

  /** 세부정보 (진료시간·휴진·주차·응급실) */
  async getDetailInfo(
    ykiho: string,
    params: DetailParams = {},
  ): Promise<DetailInfoResponse> {
    const { data } = await getDetailInfo(
      { ...params, ykiho },
      withKrDataConfig(this.config),
    );
    return data;
  }

  /** 시설정보 (병상·수술실 등) */
  async getFacilityInfo(
    ykiho: string,
    params: DetailParams = {},
  ): Promise<FacilityInfoResponse> {
    const { data } = await getFacilityInfo(
      { ...params, ykiho },
      withKrDataConfig(this.config),
    );
    return data;
  }

  /** 진료과목정보 */
  async getSubjectInfo(
    ykiho: string,
    params: DetailParams = {},
  ): Promise<SubjectInfoResponse> {
    const { data } = await getSubjectInfo(
      { ...params, ykiho },
      withKrDataConfig(this.config),
    );
    return data;
  }

  /** 교통정보 */
  async getTransportInfo(
    ykiho: string,
    params: DetailParams = {},
  ): Promise<TransportInfoResponse> {
    const { data } = await getTransportInfo(
      { ...params, ykiho },
      withKrDataConfig(this.config),
    );
    return data;
  }

  /** 의료장비정보 */
  async getEquipmentInfo(
    ykiho: string,
    params: DetailParams = {},
  ): Promise<EquipmentInfoResponse> {
    const { data } = await getEquipmentInfo(
      { ...params, ykiho },
      withKrDataConfig(this.config),
    );
    return data;
  }

  /** 간호등급정보 */
  async getNursingGradeInfo(
    ykiho: string,
    params: DetailParams = {},
  ): Promise<NursingGradeInfoResponse> {
    const { data } = await getNursingGradeInfo(
      { ...params, ykiho },
      withKrDataConfig(this.config),
    );
    return data;
  }

  /** 식대가산정보 */
  async getFoodAddcInfo(
    ykiho: string,
    params: DetailParams = {},
  ): Promise<FoodAddcInfoResponse> {
    const { data } = await getFoodAddcInfo(
      { ...params, ykiho },
      withKrDataConfig(this.config),
    );
    return data;
  }

  /** 특수진료정보 (진료가능분야) */
  async getSpecialDiagnosisInfo(
    ykiho: string,
    params: DetailParams = {},
  ): Promise<SpecialDiagnosisInfoResponse> {
    const { data } = await getSpecialDiagnosisInfo(
      { ...params, ykiho },
      withKrDataConfig(this.config),
    );
    return data;
  }

  /** 전문병원지정분야. 전문병원이 아니면 0건이다. */
  async getSpecialtyHospitalFields(
    ykiho: string,
    params: DetailParams = {},
  ): Promise<SpecialDiagnosisInfoResponse> {
    const { data } = await getSpecialtyHospitalFieldList(
      { ...params, ykiho },
      withKrDataConfig(this.config),
    );
    return data;
  }

  /** 전문과목별 전문의수 */
  async getSpecialistCounts(
    ykiho: string,
    params: DetailParams = {},
  ): Promise<SpecialistCountInfoResponse> {
    const { data } = await getSpecialistCountInfo(
      { ...params, ykiho },
      withKrDataConfig(this.config),
    );
    return data;
  }

  /** 기타인력수 */
  async getEtcStaffInfo(
    ykiho: string,
    params: DetailParams = {},
  ): Promise<EtcStaffInfoResponse> {
    const { data } = await getEtcStaffInfo(
      { ...params, ykiho },
      withKrDataConfig(this.config),
    );
    return data;
  }

  // ── 배치용 ────────────────────────────────────────

  /**
   * 병원 기본목록을 페이지 단위로 끝까지 순회한다. 배치 적재용.
   * 각 페이지의 응답을 원본 그대로 넘긴다.
   *
   * 30 TPS 제한이 있으니 호출 간격 제어가 필요하면 호출부에서 처리하라.
   */
  async *paginateHospitalList(
    numOfRows = 1000,
    params: Omit<GetHospitalListParams, 'pageNo' | 'numOfRows'> = {},
  ): AsyncGenerator<HospitalListResponse> {
    let pageNo = 1;
    let fetched = 0;

    for (;;) {
      const response = await this.getHospitalList({
        ...params,
        pageNo,
        numOfRows,
      });

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
