/**
 * 비급여 항목 한 건.
 *
 * 2026-07 실측으로 확정한 필드다. 표본 전건에서 **19개 필드가 하나도 누락 없이** 왔다.
 * data.go.kr 의 요약(List2)과 코드 체계(npayCd/npayMdivCd/minPrc/maxPrc)가 겹치지만,
 * 여기엔 중앙값·최빈값·가중평균(middPrc/hifrqPrc/wgtAvgCprc)이 더 있다.
 *
 * 값은 원본 그대로 둔다 — 정규화하지 않는다. 숫자 필드가 문자열로 오는 일은 아직 못 봤지만
 * 공개 API 가 아니라 보증이 없으니, 적재하는 쪽에서 원본을 통째로 남겨두는 편이 안전하다.
 */
export interface NpayItem {
  /** 숫자 기관 ID('41356837'). 암호화 ykiho 가 아니다 — resolveHospitalId 참고. */
  ykiho: string;
  yadmNm: string;
  /** 종별코드. **'31'(의원)이 여기서는 나온다** — data.go.kr 비급여에는 없는 값이다. */
  clCd: string;
  clCdNm: string;

  /** 비급여 항목코드('PDZ160000'). data.go.kr 의 npayCd 와 같은 체계다. */
  npayCd: string;
  /** '제증명수수료/제증명서 사본' 처럼 슬래시로 대·소분류가 붙어 온다. */
  npayCdNm: string;
  npayPubDescTpCd: string;

  /** 중분류('1993A' = 제증명수수료). */
  npayMdivCd: string;
  npayMdivCdNm: string;
  /** 소분류. */
  npaySdivCd: string;
  npaySdivCdNm: string;
  /** 상세분류. 소분류와 같은 값인 경우가 많다. */
  npayDtlDivCd: string;
  npayDtlDivCdNm: string;

  sortOrd: number;

  /** 해당 기관이 신고한 최저가. 단일가면 minPrc === maxPrc 다. */
  minPrc: number;
  maxPrc: number;
  /** 아래 셋은 **그 기관 값이 아니라 전체 기관 통계**로 보인다(미검증). 중앙값·최빈값·가중평균. */
  middPrc: number;
  hifrqPrc: number;
  wgtAvgCprc: number;
}

/** diagAmtInfoAjax.do 응답 봉투. 우리가 쓰는 부분만 적었다. */
export interface NpayResponse {
  failed?: boolean;
  data?: {
    /** 평면 목록. 이것만 쓰면 된다. */
    npayPubList?: NpayItem[];
    /**
     * npayPubList 를 중분류로 묶은 것. **내용이 같아 중복이다** — 쓰지 않는다.
     * data.template 에는 렌더링된 HTML 이 통째로 들어오는데 그것도 버린다.
     */
    npayMdivList?: unknown;
    /** 'Y'/'N'. 공개할 비급여가 아예 없는 기관과 조회 실패를 구분하는 값이다. */
    npayPubListGbn?: string;
  };
}
