/**
 * 공공데이터포털 응답 봉투를 만든다.
 *
 * DB 미러는 API 응답의 item 을 JSON 그대로 보관한다. 그래서 조회 결과를
 * **원본 API 와 똑같은 구조**로 다시 조립해 돌려준다. 소스(DB/원본 API)가 달라도
 * 호출부(서버 컨트롤러·CLI)는 같은 타입을 받는다.
 *
 * 응답 타입 자체는 openapi 에서 생성된 것(@krdata/*)을 쓴다. 여기서는 그 구조를 채우기만 한다.
 */
export interface EnvelopePage<T> {
  items: T[];
  pageNo: number;
  numOfRows: number;
  totalCount: number;
}

/** 원본 API 의 정상 응답 헤더. DB 조회에도 같은 값을 쓴다. */
const NORMAL_HEADER = {
  resultCode: '00',
  resultMsg: 'NORMAL SERVICE.',
} as const;

/**
 * item 목록을 원본 API 응답 봉투로 감싼다.
 *
 * 반환 타입은 호출부가 생성 타입(HospitalFullDownResponse 등)으로 지정한다.
 * 구조가 동일하므로 그대로 대입된다.
 */
export function toKrDataEnvelope<T>(page: EnvelopePage<T>): {
  response: {
    header: { resultCode: string; resultMsg: string };
    body: {
      items: { item: T[] };
      numOfRows: number;
      pageNo: number;
      totalCount: number;
    };
  };
} {
  return {
    response: {
      header: { ...NORMAL_HEADER },
      body: {
        items: { item: page.items },
        numOfRows: page.numOfRows,
        pageNo: page.pageNo,
        totalCount: page.totalCount,
      },
    },
  };
}
