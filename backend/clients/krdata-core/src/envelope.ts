import {
  extractResultHeader,
  KrDataResultHeader,
  normalizeKrDataResponse,
} from './normalize';

/**
 * 응답 봉투 어댑터.
 *
 * **같은 data.go.kr 라도 부처마다 봉투가 다르다.** 게이트웨이는 공유하지만 그 뒤의 서비스는
 * 부처가 따로 만든 것이라, 포맷 파라미터 이름·성공 결과코드·목록 위치가 제각각이다.
 * 재시도·한도·키 마스킹처럼 게이트웨이가 책임지는 부분은 전부 공통이므로, 갈리는 이 셋만
 * 여기서 갈아끼운다.
 *
 * 기본값은 `KRDATA_STANDARD_ENVELOPE`(심평원·중앙의료원이 쓰는 형태)이므로 기존 패키지는
 * 아무것도 넘기지 않으면 된다.
 */
export interface KrDataEnvelope {
  /**
   * 응답 포맷 파라미터. 주지 않으면 XML 로 온다.
   *
   * 표준은 `_type=json` 이지만 행정안전부(1741000)는 `type=json` 이다.
   * **이름만 다른 게 아니라 결과 봉투가 갈린다** — 자세한 건 @krdata/mois 참고.
   */
  formatParam: { name: string; value: string };

  /** 응답에서 결과 헤더를 꺼낸다. 없으면 undefined (검사를 건너뛴다). */
  readHeader(payload: unknown): KrDataResultHeader | undefined;

  /** 정상 결과코드인가. */
  isSuccess(resultCode: string): boolean;

  /** 목록이 항상 배열이 되도록 응답을 제자리에서 보정한다. */
  normalize(payload: unknown): void;
}

/**
 * 공공데이터포털 표준 봉투. `response.header` / `response.body.items.item` 형태다.
 * 심평원(B551182)·국립중앙의료원(B552657)이 이 형태다.
 */
export const KRDATA_STANDARD_ENVELOPE: KrDataEnvelope = {
  formatParam: { name: '_type', value: 'json' },
  readHeader: extractResultHeader,
  isSuccess: (resultCode) => resultCode === '00',
  normalize: normalizeKrDataResponse,
};
