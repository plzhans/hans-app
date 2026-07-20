/**
 * hira_hospital_detail(op='npay-web').data 에 저장하는 모양.
 *
 * **@kr-or/hira 의 NpayItem 과 일부러 다르다.** 원본에서 기관 단위로 반복되는 4개
 * (ykiho·yadmNm·clCd·clCdNm)를 뺐다 — 전부 hira_hospital 에 이미 있고, 한 기관에 수백 행이라
 * 그대로 두면 그만큼 복제된다(중앙대병원 실측 16% 절감). 그중 ykiho 만 봉투 위로 올렸다.
 * 나머지 15필드는 원본 그대로다.
 *
 * **적재 쪽(admin)과 조회 쪽(여기)이 함께 쓰는 계약이라 여기 둔다.** 이 모양을 바꾸면
 * 이미 쌓인 행을 읽지 못하므로, 필드를 빼거나 이름을 바꾸지 마라 — 더하는 것만 안전하다.
 */
export interface NpayWebRecord {
  /**
   * 심평원 홈페이지의 **숫자 기관ID**('11100052'). 암호화 요양기호가 아니다.
   * 원본이 item 마다 반복해서 주던 것을 위로 올렸다.
   *
   * **이게 있으면 다음 조회 때 step1(hospInfoAjax.do)을 건너뛴다** — 요청이 2번에서 1번이 된다.
   */
  ykiho: string;

  /** 응답의 npayPubList. **빈 배열이면 "긁었는데 그 기관이 신고한 게 없다"** 는 뜻이다. */
  npayPubList: NpayWebItem[];
}

/**
 * 비급여 항목 하나. 원본 그대로다 — 정규화하지 않는다.
 *
 * **공개 API 가 아니라 구조 보증이 없다.** 바뀌면 원본이 남아 있어야 다시 매핑할 수 있으므로,
 * 적재하는 쪽에서 값을 손대지 않는다(clients/kr-or-hira/src/types.ts 와 같은 이유).
 */
export interface NpayWebItem {
  /** 표준 항목코드('ABZ010001'). 공개 API 의 npayCd 와 **같은 체계다**(2026-07 실측: 345/345 일치). */
  npayCd: string;

  /** '상급병실료/1인실' 처럼 분류가 슬래시로 붙어 온다. 공개 API 의 npayKorNm 과 문자열까지 같다. */
  npayCdNm: string;

  npayPubDescTpCd: string;

  /** 중분류('1010A' = 상급병실료). **공개 API 엔 없는 분류 코드다** — 그쪽은 이름을 잘라 파생해야 한다. */
  npayMdivCd: string;
  npayMdivCdNm: string;

  npaySdivCd: string;
  npaySdivCdNm: string;

  /** 상세분류. 소분류와 같은 값인 경우가 많다. */
  npayDtlDivCd: string;
  npayDtlDivCdNm: string;

  sortOrd: number;

  /**
   * 그 기관이 신고한 최저·최고가. **단일가면 min === max 다.**
   *
   * 공개 API 는 행마다 단일 금액(curAmt)을 주고 여기는 코드별로 접힌 범위를 준다 —
   * 같은 것을 다른 해상도로 주는 것이고, 두 값이 일치한다(2026-07 실측 345/345).
   */
  minPrc: number;
  maxPrc: number;

  /**
   * 중앙값·최빈값·가중평균.
   *
   * **그 기관 값이 아니다** — 346건 중 223건에서 middPrc 가 그 기관의 minPrc~maxPrc 밖으로 나간다
   * (13,000원 하나만 신고한 기관의 중앙값이 57,800). 비교 기준으로 표기되는 값이다.
   * **모수가 뭔지는 확인되지 않았다**(전국인지 지역인지 종별인지). 기관 가격으로 읽지 마라.
   */
  middPrc: number;
  hifrqPrc: number;
  wgtAvgCprc: number;
}
