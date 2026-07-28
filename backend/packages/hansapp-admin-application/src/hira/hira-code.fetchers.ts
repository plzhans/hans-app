import type { HiraCodeType } from '@hansapp/application';
import type {
  AddressCodeItem,
  EquipmentCodeItem,
  InstitutionClassCodeItem,
  SearchCodeItem,
  SubjectCodeItem,
} from '@krdata/hira';

import type { HiraPageParams, HiraQueryService } from './hira-query.service';

/** 코드 6종의 응답은 item 타입만 다르고 봉투 구조는 같다. */
export interface CodeListResponse<TItem> {
  response?: {
    body?: {
      totalCount?: number;
      items?: { item?: TItem[] };
    };
  };
}

/** DB 컬럼(cd/cd_nm/cd_cmt)에 넣을 값 */
export interface HiraCodeValues {
  cd?: string;
  cdNm?: string;
  cdCmt?: string;
}

export interface HiraCodeFetcher<TItem> {
  /** 원본 API 호출. 종류마다 엔드포인트가 다르다. */
  fetch: (
    api: HiraQueryService,
    params: HiraPageParams,
  ) => Promise<CodeListResponse<TItem>>;

  /** 원본 item → DB 컬럼. 프로퍼티로 접근하므로 스펙이 바뀌면 컴파일 에러가 난다. */
  toValues: (item: TItem) => HiraCodeValues;
}

/**
 * 정의 시점에는 item 타입으로 검사하고, 보관할 때는 타입을 지운다.
 * (toValues 의 인자가 반공변이라 CodeFetcher<TItem> 은 CodeFetcher<unknown> 에 직접 대입되지 않는다.
 *  호출부는 항상 같은 fetch 가 준 item 을 같은 toValues 에 넘기므로 이 소거는 안전하다.)
 */
function define<TItem>(
  fetcher: HiraCodeFetcher<TItem>,
): HiraCodeFetcher<unknown> {
  return fetcher as unknown as HiraCodeFetcher<unknown>;
}

/** tp → 원본 API 호출·필드 매핑. 원본이 6개로 갈라 놓은 것을 여기서 하나로 모은다. */
export const HIRA_CODE_FETCHERS: Record<
  HiraCodeType,
  HiraCodeFetcher<unknown>
> = {
  addr: define<AddressCodeItem>({
    fetch: (api, params) => api.getAddressCodes(params),
    toValues: (item) => ({ cd: item.addrCd, cdNm: item.addrCdNm }),
  }),
  class: define<InstitutionClassCodeItem>({
    fetch: (api, params) => api.getInstitutionClassCodes(params),
    toValues: (item) => ({ cd: item.clCd, cdNm: item.clCdNm }),
  }),
  subject: define<SubjectCodeItem>({
    fetch: (api, params) => api.getSubjectCodes(params),
    toValues: (item) => ({
      cd: item.dgsbjtCd,
      cdNm: item.dgsbjtCdNm,
      cdCmt: item.dgsbjtCdCmmt,
    }),
  }),
  equipment: define<EquipmentCodeItem>({
    fetch: (api, params) => api.getEquipmentCodes(params),
    toValues: (item) => ({ cd: item.oftCd, cdNm: item.oftCdNm }),
  }),
  specialty: define<SearchCodeItem>({
    fetch: (api, params) => api.getSpecialtyHospitalCodes(params),
    toValues: (item) => ({
      cd: item.srchCd,
      cdNm: item.srchCdNm,
      cdCmt: item.srchCdCmmt,
    }),
  }),
  special: define<SearchCodeItem>({
    fetch: (api, params) => api.getSpecialDiagnosisCodes(params),
    toValues: (item) => ({
      cd: item.srchCd,
      cdNm: item.srchCdNm,
      cdCmt: item.srchCdCmmt,
    }),
  }),
};
