/**
 * 비급여 진료비 조회 결과.
 *
 * **원본(HIRA)의 모양이 아니라 우리 모양이다.** 원본은 (기관, 항목) 한 쌍이 평평한 한 행이고,
 * 그 행마다 병원 정보(ykiho·yadmNm·clCd·sidoCd…)가 9개씩 반복된다. 그건 전부 병원 상세
 * (/healthcare/hospitals/:id)에 이미 있는 값이라 여기서 버린다.
 *
 * **출처가 둘이 될 것을 전제로 만든 구조다.** 병원급은 공공 API(curAmt — 그 기관의 실제
 * 청구금액 단일값), 의원급은 심평원 홈페이지(minPrc~maxPrc — 범위)에서 온다. 둘의 모양이
 * 달라서 원본 봉투로는 한 자리에 담을 수 없다. 그래서 가격을 처음부터 min/max 로 두었다 —
 * 단일값이면 min === max 다.
 */

/** 범위를 이루는 개별 행 하나. */
export interface NonPaymentPriceDetail {
  /** 요양기관이 자체적으로 붙인 항목명(원본 yadmNpayCdNm). 'Hip MRI' 처럼 기관 제각각이다. */
  name?: string;

  /** 그 기관이 실제로 받는 금액(원). */
  amount: number;
}

/**
 * 그 기관이 이 표준코드로 받는 가격.
 *
 * **범위가 기본형이고 세부는 그 안에 딸린다.** 출처에 따라 범위가 만들어지는 방식이 다르기 때문이다 —
 *   병원급(공공 API)  원본이 행마다 단일 금액(curAmt)이라, 여러 행을 모아 **계산한** 범위다. details 가 찬다.
 *   의원급(홈페이지)  원본이 처음부터 minPrc~maxPrc **범위**다. 쪼갤 내역이 없어 details 가 빈다.
 * 둘 다 뜻은 같다 — "그 기관이 이 코드로 받는 최저~최고".
 */
export interface NonPaymentPrice {
  /** 최저가. 단일가면 max 와 같다 — 그때는 범위로 표시하지 마라. */
  min: number;

  /** 최고가. */
  max: number;

  /**
   * 범위를 이룬 개별 행. **빈 배열이 정상이다** — 원본이 범위만 주는 출처(의원급)가 그렇다.
   * 비었으면 "쪼갤 내역이 없다" 는 뜻이지 "못 받았다" 가 아니다.
   */
  details: NonPaymentPriceDetail[];
}

/**
 * 표준코드 하나. **같은 코드에 원본 행이 여럿일 수 있다** — 체외충격파(SZ0840000)가
 * 단순/복잡 두 행인 식이다. 그래서 금액이 단일값이 아니라 범위다.
 */
export interface NonPaymentItem {
  /** 표준 항목코드(원본 npayCd). **원본은 number 와 string 이 섞여 오는데 여기서 string 으로 고정한다.** */
  code: string;

  /** 항목명. 원본 npayKorNm 에서 대분류를 뗀 나머지다(대분류는 그룹 제목에 있다). */
  name: string;

  price: NonPaymentPrice;
}

/** 중분류 하나. 원본 게시 순서(sno)를 유지한다. */
export interface NonPaymentCategory {
  name: string;

  /**
   * 중분류코드(원본 npayMdivCd, 예: 1025B). 화면이 이 코드로 표시 그룹(검사·초음파·MRI…)을 묶는다.
   * **없을 수 있다** — 코드마스터(hira_npay_code)에 아직 없는 항목이면 붙지 않는다.
   */
  mdivCd?: string;

  items: NonPaymentItem[];
}

/**
 * 이 병원의 비급여를 어디서 가져왔나 / 가져올 수 있나.
 *
 * **화면이 "없음" 과 "아직 안 받아봤음" 을 구분해야 해서 있다.** 전자는 끝이고, 후자는
 * 사용자가 갱신을 요청할 수 있다.
 *
 *   hira        공개 API(hira_hospital_npay)에서 왔다. 병원급 이상.
 *   web         심평원 홈페이지 크롤에서 왔다. 의원급.
 *   none        받아봤는데 그 기관이 신고한 게 없다. 끝.
 *   requestable 공개 API 에 없고 아직 크롤한 적도 없다. **갱신 요청 가능.**
 *   unavailable 요청할 수 없다. ykiho 가 없는 병원(NMC 에만 있는 병원)은 크롤 자체가 불가능하다
 *               — 크롤 step1 이 암호화 요양기호를 요구한다.
 */
export type NonPaymentSource =
  'hira' | 'web' | 'none' | 'requestable' | 'unavailable';

/** 갱신 요청의 진행 상태. 요청한 적 없으면 없다. */
export type NonPaymentRequestStatus = 'pending' | 'running' | 'failed';

export interface HospitalNonPayment {
  /**
   * 병원이 신고한 비급여 안내 URL(원본 urlAddr). 원본은 행마다 같은 값을 반복하므로
   * 여기서는 한 번만 싣는다. **없는 기관이 있다**(표본 4,000행 중 391건). 크롤 출처엔 아예 없다.
   */
  noticeUrl?: string;

  source: NonPaymentSource;

  /**
   * 큐에 걸린 갱신 요청의 상태. **done 은 여기 오지 않는다** — 처리가 끝났으면 그 결과가
   * source(web|none)로 나타나므로 요청 상태를 따로 말할 이유가 없다.
   */
  requestStatus?: NonPaymentRequestStatus;

  categories: NonPaymentCategory[];
}
