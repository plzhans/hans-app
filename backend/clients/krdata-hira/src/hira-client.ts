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
import { getClinicTop5List } from './generated/hosp-diag/hosp-diag';
import type { ClinicTop5Response } from './generated/hosp-diag/model';
import { getExcellentAssessmentList } from './generated/excl-asm/excl-asm';
import type {
  ExcellentAssessmentResponse,
  GetExcellentAssessmentListParams,
} from './generated/excl-asm/model';
import {
  getChildNightCareList,
  getNursingHospitalList,
  getSpecialtyHospitalList,
  getSubjectHospitalList,
} from './generated/spcl-mdlrt/spcl-mdlrt';
import type {
  GetChildNightCareListParams,
  GetNursingHospitalListParams,
  GetSpecialtyHospitalListParams,
  GetSubjectHospitalListParams,
  SpecialCareHospitalResponse,
} from './generated/spcl-mdlrt/model';
import { getHospitalAssessmentList } from './generated/hosp-asm/hosp-asm';
import type {
  GetHospitalAssessmentListParams,
  HospitalAssessmentResponse,
} from './generated/hosp-asm/model';
import {
  getDiagnosisMdfeeList,
  getOrientalMdfeeList,
  getPharmacyMdfeeList,
} from './generated/mdfee-crtr/mdfee-crtr';
import type {
  DiagnosisMdfeeResponse,
  GetDiagnosisMdfeeListParams,
  GetOrientalMdfeeListParams,
  GetPharmacyMdfeeListParams,
  OrientalMdfeeResponse,
  PharmacyMdfeeResponse,
} from './generated/mdfee-crtr/model';
import {
  getNonPaymentItemHospDetailList,
  getNonPaymentItemHospSummaryList,
} from './generated/npay-damt/npay-damt';
import type {
  GetNonPaymentItemHospDetailListParams,
  GetNonPaymentItemHospSummaryListParams,
  NonPaymentDetailResponse,
  NonPaymentSummaryResponse,
} from './generated/npay-damt/model';
import { getMajorComponentCodeList } from './generated/msup-cmpn/msup-cmpn';
import type {
  GetMajorComponentCodeListParams,
  MajorComponentCodeResponse,
} from './generated/msup-cmpn/model';
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
 * 수가기준·의약품성분약효 서비스의 '전체' 검색어.
 *
 * 이 둘은 **검색 파라미터를 하나도 안 주면 조용히 0건**을 준다(2026-07 실측). 병원목록처럼
 * '생략 = 전체'가 아니라 필터가 사실상 필수인 검색형이다. 대신 `%` 를 주면 전건이 나온다
 * (약국 287 / 한방 10,320 / 진료 423,910 / 주성분 60,424건).
 */
export const MDFEE_ALL = '%';

/** 검색 파라미터가 하나라도 있는지. 페이지 파라미터는 검색어가 아니다. */
function hasSearchFilter(params: Record<string, unknown>): boolean {
  return Object.entries(params).some(
    ([key, value]) =>
      key !== 'pageNo' && key !== 'numOfRows' && value !== undefined,
  );
}

/**
 * 필터가 하나도 없으면 전체 검색어를 채운다.
 *
 * paginate* 는 이름부터 '끝까지 훑는다'는 뜻인데, 필터 없이 그대로 넘기면 첫 페이지가
 * 0건이라 **아무것도 안 나오고 조용히 끝난다.** 빈 결과와 구별이 안 되니 여기서 메운다.
 */
function withMdfeeAll<T extends Record<string, unknown>>(params: T): T {
  return hasSearchFilter(params) ? params : { ...params, mdfeeCd: MDFEE_ALL };
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

  // ── 병원별질병정보서비스 ──────────────────────────

  /**
   * 의원 진료 상위질병 5개. 최근 1년간 해당 의원에서 진료된 상위 5개
   * 국민관심질병명을 오름차순으로 반환한다. ykiho 는 의원(clCd='31') 것이어야 한다.
   */
  async getClinicTop5(ykiho: string): Promise<ClinicTop5Response> {
    const { data } = await getClinicTop5List(
      { ykiho, pageNo: 1, numOfRows: 1 },
      withKrDataConfig(this.config),
    );
    return data;
  }

  // ── 우수기관병원평가정보서비스 ────────────────────

  /**
   * 우수기관 평가정보. **ykiho 가 옵션이라 병원별 조회가 아니라 목록 조회다.**
   * 생략하면 우수기관 전체를 페이지 단위로 받는다 — 79,739개를 돌 필요가 없다.
   *
   * 한 기관이 평가항목(asmNm)마다 행을 가지므로 ykiho 하나에 여러 행이 온다.
   */
  async getExcellentAssessments(
    params: GetExcellentAssessmentListParams = {},
  ): Promise<ExcellentAssessmentResponse> {
    const { data } = await getExcellentAssessmentList(
      params,
      withKrDataConfig(this.config),
    );
    return data;
  }

  // ── 병원평가정보서비스 ────────────────────────────

  /**
   * 병원평가 상세등급. **ykiho 가 옵션이라 목록 조회다.** 생략하면 평가대상 전체를
   * 페이지 단위로 받는다.
   *
   * 한 기관이 한 행이고 평가항목이 asmGrd01~24 로 가로로 붙는다. 우수기관서비스가
   * 항목마다 행을 주는 것(getExcellentAssessments)과 반대 모양이니 섞지 마라.
   */
  async getHospitalAssessments(
    params: GetHospitalAssessmentListParams = {},
  ): Promise<HospitalAssessmentResponse> {
    const { data } = await getHospitalAssessmentList(
      params,
      withKrDataConfig(this.config),
    );
    return data;
  }

  // ── 특수진료병원정보서비스 (목록형) ────────────────

  /**
   * 전문병원 목록.
   *
   * **응답에 srchCd 가 없다.** 어느 분야 전문병원인지는 응답이 아니라 요청 필터가 정한다.
   * 지정분야까지 알려면 전문병원코드 19종(getSpecialtyHospitalCodes)을 srchCd 로 돌려라.
   * 그러면 (ykiho, srchCd) 매핑이 20콜 남짓에 나온다 — 병원마다 MadmDtl 의
   * getSpecialtyHospitalFields 를 두드리는 것(규모기관만 해도 4,231콜)의 대안이다.
   */
  async getSpecialtyHospitals(
    params: GetSpecialtyHospitalListParams = {},
  ): Promise<SpecialCareHospitalResponse> {
    const { data } = await getSpecialtyHospitalList(
      params,
      withKrDataConfig(this.config),
    );
    return data;
  }

  /** 진료과목별 병원 목록. 1단계의 dgsbjtCd 역조회와 목적이 겹친다. */
  async getSubjectHospitals(
    params: GetSubjectHospitalListParams = {},
  ): Promise<SpecialCareHospitalResponse> {
    const { data } = await getSubjectHospitalList(
      params,
      withKrDataConfig(this.config),
    );
    return data;
  }

  /** 요양병원 목록. 병원 기본목록의 clCd='28' 로도 같은 집합을 얻는다. */
  async getNursingHospitals(
    params: GetNursingHospitalListParams = {},
  ): Promise<SpecialCareHospitalResponse> {
    const { data } = await getNursingHospitalList(
      params,
      withKrDataConfig(this.config),
    );
    return data;
  }

  /** 소아야간진료(20시 이후) 병의원 목록. 다른 API 로는 얻기 어려운 축이다. */
  async getChildNightCareHospitals(
    params: GetChildNightCareListParams = {},
  ): Promise<SpecialCareHospitalResponse> {
    const { data } = await getChildNightCareList(
      params,
      withKrDataConfig(this.config),
    );
    return data;
  }

  // ── 수가기준정보서비스 (목록형) ────────────────────

  /**
   * 약국수가 목록. 단가가 `unprc` 하나뿐이다(약국은 종별 구분이 없다). 전건 287건.
   *
   * **검색 파라미터를 하나도 안 주면 0건이다.** 전량이 필요하면 `mdfeeCd: '%'` 를 주거나
   * paginatePharmacyMdfees() 를 써라.
   */
  async getPharmacyMdfees(
    params: GetPharmacyMdfeeListParams = {},
  ): Promise<PharmacyMdfeeResponse> {
    const { data } = await getPharmacyMdfeeList(
      params,
      withKrDataConfig(this.config),
    );
    return data;
  }

  /**
   * 한방수가 목록. 단가가 종별 4종(unprc1~4)으로 나뉜다. 전건 10,320건.
   * 약국수가와 마찬가지로 **필터 없이 부르면 0건이다.**
   */
  async getOrientalMdfees(
    params: GetOrientalMdfeeListParams = {},
  ): Promise<OrientalMdfeeResponse> {
    const { data } = await getOrientalMdfeeList(
      params,
      withKrDataConfig(this.config),
    );
    return data;
  }

  /**
   * 진료수가 목록. 단가가 종별 6종(unprc1~6)으로 나뉜다.
   * **전건 423,910건으로 셋 중 모수가 압도적이다** — 전량 적재는 424콜이니 각오하고 돌려라.
   * 역시 **필터 없이 부르면 0건이다.**
   */
  async getDiagnosisMdfees(
    params: GetDiagnosisMdfeeListParams = {},
  ): Promise<DiagnosisMdfeeResponse> {
    const { data } = await getDiagnosisMdfeeList(
      params,
      withKrDataConfig(this.config),
    );
    return data;
  }

  // ── 비급여진료비정보조회서비스 ────────────────────

  /**
   * 기관별 비급여 항목의 **실제 청구금액**(curAmt). 병원 상세에 붙일 때 쓰는 쪽이다.
   *
   * `ykiho` 를 주면 그 기관 것만 **1콜로** 나온다(중앙대학교병원 666건). 가이드는 필수라
   * 하지만 실제로는 옵션이라, 생략하면 전 기관 259,353건을 페이지로 받는다
   * (그때는 paginateNonPaymentDetails() 를 써라).
   *
   * **항목으로는 못 거른다** — npayCd·itemCd 를 넘겨도 무시된다. 기관 단위로 받아서
   * 호출부에서 걸러라.
   *
   * **병원급 이상만 있다.** 의원(clCd='31')은 아무리 불러도 0건이다 — 없는 게 아니라
   * 이 제도가 병원급 이상만 공개 대상이라서다.
   */
  async getNonPaymentDetails(
    params: GetNonPaymentItemHospDetailListParams = {},
  ): Promise<NonPaymentDetailResponse> {
    const { data } = await getNonPaymentItemHospDetailList(
      params,
      withKrDataConfig(this.config),
    );
    return data;
  }

  /**
   * 비급여 항목의 **가격 범위**(minPrc~maxPrc) + 분류체계(중/소/상세분류).
   *
   * **`ykiho` 가 먹지 않는다**(넘겨도 무시). 병원 단위로 보려면 `yadmNm` 을 쓰거나
   * getNonPaymentDetails() 를 써라. 항목 단위 비교(`itemCd`)가 이 오퍼레이션의 용도다.
   */
  async getNonPaymentSummaries(
    params: GetNonPaymentItemHospSummaryListParams = {},
  ): Promise<NonPaymentSummaryResponse> {
    const { data } = await getNonPaymentItemHospSummaryList(
      params,
      withKrDataConfig(this.config),
    );
    return data;
  }

  // ── 의약품성분약효정보조회서비스 (목록형) ──────────

  /**
   * 주성분(일반명) 목록. 성분코드별 약효분류·제형·투여경로·함량·단위. 전건 60,424건.
   *
   * 키인 `gnlNmCd` 는 이 서비스가 아니라 **약가기준정보조회서비스의 약가목록조회**에서 나온다.
   *
   * 수가 3종과 마찬가지로 **필터 없이 부르면 0건이다.** 전량은 `gnlNmCd: '%'` 나
   * paginateMajorComponentCodes() 로 받아라.
   */
  async getMajorComponentCodes(
    params: GetMajorComponentCodeListParams = {},
  ): Promise<MajorComponentCodeResponse> {
    const { data } = await getMajorComponentCodeList(
      params,
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

  /**
   * 전문병원 목록을 페이지 단위로 끝까지 순회한다. 배치 적재용.
   *
   * 지정분야까지 채우려면 **호출부가 전문병원코드 19종을 srchCd 로 돌린다.** clCd 루프를
   * 호출부에 맡기는 paginateHospitalList 와 같은 이유로, 코드 루프도 여기 넣지 않는다.
   *
   *   for (const cd of specialtyCodes) {
   *     for await (const page of client.paginateSpecialtyHospitals(1000, { srchCd: cd })) { … }
   *   }
   */
  async *paginateSpecialtyHospitals(
    numOfRows = 1000,
    params: Omit<GetSpecialtyHospitalListParams, 'pageNo' | 'numOfRows'> = {},
  ): AsyncGenerator<SpecialCareHospitalResponse> {
    yield* this.paginateSpecialCare(
      (page) => this.getSpecialtyHospitals({ ...params, ...page }),
      numOfRows,
    );
  }

  /** 소아야간진료 병의원 목록을 페이지 단위로 끝까지 순회한다. 배치 적재용. */
  async *paginateChildNightCareHospitals(
    numOfRows = 1000,
    params: Omit<GetChildNightCareListParams, 'pageNo' | 'numOfRows'> = {},
  ): AsyncGenerator<SpecialCareHospitalResponse> {
    yield* this.paginateSpecialCare(
      (page) => this.getChildNightCareHospitals({ ...params, ...page }),
      numOfRows,
    );
  }

  /** 특수진료병원 4종은 응답 구조가 같아 순회 로직을 공유한다. */
  private async *paginateSpecialCare(
    fetchPage: (page: {
      pageNo: number;
      numOfRows: number;
    }) => Promise<SpecialCareHospitalResponse>,
    numOfRows: number,
  ): AsyncGenerator<SpecialCareHospitalResponse> {
    let pageNo = 1;
    let fetched = 0;

    for (;;) {
      const response = await fetchPage({ pageNo, numOfRows });

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

  /** 병원평가 등급을 페이지 단위로 끝까지 순회한다. 배치 적재용. */
  async *paginateHospitalAssessments(
    numOfRows = 1000,
    params: Omit<GetHospitalAssessmentListParams, 'pageNo' | 'numOfRows'> = {},
  ): AsyncGenerator<HospitalAssessmentResponse> {
    let pageNo = 1;
    let fetched = 0;

    for (;;) {
      const response = await this.getHospitalAssessments({
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

  /**
   * 약국수가 목록을 페이지 단위로 끝까지 순회한다. 배치 적재용. 전건 287건이라 1콜이면 끝난다.
   *
   * 필터를 안 주면 `mdfeeCd: '%'` 로 전건을 훑는다 — 아래 MDFEE_ALL 설명 참고.
   */
  async *paginatePharmacyMdfees(
    numOfRows = 1000,
    params: Omit<GetPharmacyMdfeeListParams, 'pageNo' | 'numOfRows'> = {},
  ): AsyncGenerator<PharmacyMdfeeResponse> {
    yield* this.paginateListPages(
      (page) => this.getPharmacyMdfees({ ...withMdfeeAll(params), ...page }),
      numOfRows,
    );
  }

  /** 한방수가 목록을 페이지 단위로 끝까지 순회한다. 배치 적재용. 전건 10,320건(11콜). */
  async *paginateOrientalMdfees(
    numOfRows = 1000,
    params: Omit<GetOrientalMdfeeListParams, 'pageNo' | 'numOfRows'> = {},
  ): AsyncGenerator<OrientalMdfeeResponse> {
    yield* this.paginateListPages(
      (page) => this.getOrientalMdfees({ ...withMdfeeAll(params), ...page }),
      numOfRows,
    );
  }

  /**
   * 진료수가 목록을 페이지 단위로 끝까지 순회한다. 배치 적재용.
   *
   * **전건 423,910건 = numOfRows 1000 기준 424콜이다.** 개발계정 일 10,000 트래픽 안에는
   * 들어가지만, 아무 생각 없이 끝까지 돌릴 크기는 아니다. 30 TPS 제한도 있으니
   * 호출 간격이 필요하면 호출부에서 처리하라.
   */
  async *paginateDiagnosisMdfees(
    numOfRows = 1000,
    params: Omit<GetDiagnosisMdfeeListParams, 'pageNo' | 'numOfRows'> = {},
  ): AsyncGenerator<DiagnosisMdfeeResponse> {
    yield* this.paginateListPages(
      (page) => this.getDiagnosisMdfees({ ...withMdfeeAll(params), ...page }),
      numOfRows,
    );
  }

  /**
   * 비급여 상세(실제 청구금액)를 페이지 단위로 끝까지 순회한다. 배치 적재용.
   * 전건 259,353건(260콜). `ykiho` 를 주면 그 기관 것만 훑는다.
   */
  async *paginateNonPaymentDetails(
    numOfRows = 1000,
    params: Omit<
      GetNonPaymentItemHospDetailListParams,
      'pageNo' | 'numOfRows'
    > = {},
  ): AsyncGenerator<NonPaymentDetailResponse> {
    yield* this.paginateListPages(
      (page) => this.getNonPaymentDetails({ ...params, ...page }),
      numOfRows,
    );
  }

  /**
   * 비급여 요약(가격 범위)을 페이지 단위로 끝까지 순회한다. 배치 적재용.
   * 전건 187,627건(188콜).
   */
  async *paginateNonPaymentSummaries(
    numOfRows = 1000,
    params: Omit<
      GetNonPaymentItemHospSummaryListParams,
      'pageNo' | 'numOfRows'
    > = {},
  ): AsyncGenerator<NonPaymentSummaryResponse> {
    yield* this.paginateListPages(
      (page) => this.getNonPaymentSummaries({ ...params, ...page }),
      numOfRows,
    );
  }

  /** 주성분 목록을 페이지 단위로 끝까지 순회한다. 배치 적재용. 전건 60,424건(61콜). */
  async *paginateMajorComponentCodes(
    numOfRows = 1000,
    params: Omit<GetMajorComponentCodeListParams, 'pageNo' | 'numOfRows'> = {},
  ): AsyncGenerator<MajorComponentCodeResponse> {
    yield* this.paginateListPages(
      (page) =>
        this.getMajorComponentCodes({
          ...(hasSearchFilter(params) ? params : { gnlNmCd: MDFEE_ALL }),
          ...page,
        }),
      numOfRows,
    );
  }

  /**
   * 목록형 서비스(수가 3종·주성분)는 봉투 구조가 같아 순회 로직을 공유한다.
   * 아이템 타입만 다르다.
   */
  private async *paginateListPages<
    T extends {
      response?: {
        body?: { totalCount?: number; items?: { item?: unknown[] } };
      };
    },
  >(
    fetchPage: (page: { pageNo: number; numOfRows: number }) => Promise<T>,
    numOfRows: number,
  ): AsyncGenerator<T> {
    let pageNo = 1;
    let fetched = 0;

    for (;;) {
      const response = await fetchPage({ pageNo, numOfRows });

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

  /**
   * 우수기관 평가정보를 페이지 단위로 끝까지 순회한다. 배치 적재용.
   *
   * 우수기관만 나오므로 모수가 작다. ykiho 를 돌며 병원별로 부를 이유가 없다.
   */
  async *paginateExcellentAssessments(
    numOfRows = 1000,
    params: Omit<GetExcellentAssessmentListParams, 'pageNo' | 'numOfRows'> = {},
  ): AsyncGenerator<ExcellentAssessmentResponse> {
    let pageNo = 1;
    let fetched = 0;

    for (;;) {
      const response = await this.getExcellentAssessments({
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
