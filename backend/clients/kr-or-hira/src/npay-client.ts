import { HiraWebError } from './error';
import { HiraWebConfig, RateGate, hospitalPageUrl, resolveConfig, sendWithRetry } from './http';
import type { NpayItem, NpayResponse } from './types';

/**
 * 병원 상세 HTML 안의 숨은 필드에서 숫자 기관 ID 를 뽑는다.
 *
 *   <input type="hidden" name="ykiho" id="ykiho" value="41356837" />
 *
 * HTML 파서를 의존성으로 들이지 않는다 — 필요한 게 이 한 필드뿐이고 서버가 찍어내는 정적 문자열이다.
 * 대신 마크업이 바뀌면 조용히 못 찾는 게 아니라 HiraWebError 로 터지게 한다.
 */
const HOSPITAL_ID_PATTERN = /id="ykiho"\s+value="(\d+)"/;

export interface ListNpayResult {
  /** 숫자 기관 ID. 다음번에 step1 을 건너뛰려면 이걸 저장해 둔다. */
  hospitalId: string;
  /** 공개된 비급여 항목. 없으면 빈 배열이다. */
  items: NpayItem[];
  /**
   * 이 기관이 공개할 비급여를 갖고 있는지(응답의 npayPubListGbn === 'Y').
   * **items 가 비었다고 실패가 아니다** — 공개 대상이 없는 기관이 실제로 많다.
   */
  published: boolean;
}

/**
 * 심평원 홈페이지(www.hira.or.kr) 비급여 진료비 클라이언트.
 *
 * **이건 공개 API 가 아니라 웹 프런트 스크래핑이다.** @krdata/hira 와 헷갈리지 마라 —
 * 기관은 같은 심평원이지만 완전히 다른 계보다:
 *
 * | | @krdata/hira (data.go.kr) | @kr-or/hira (이 패키지) |
 * | --- | --- | --- |
 * | 정체 | 활용신청한 공개 API | 홈페이지 내부 ajax |
 * | 인증 | ServiceKey | 없음 |
 * | 안정성 | 스펙 있음 | **예고 없이 바뀔 수 있다** |
 * | 의원(clCd=31) | **없다** | **있다** ← 이 패키지의 유일한 존재 이유 |
 *
 * 병원급 이상은 @krdata/hira 를 쓴다. 이 패키지는 data.go.kr 에 없는 의원급을 메우는 용도다.
 *
 * **법무 확인 전이다(2026-07).** 심평원 홈페이지 이용약관 제10조 ①2(개인적 이용 외 복제·
 * 제3자 제공 금지)·⑨(상업적 이용 금지)가 이 데이터의 서비스 적재에 정면으로 닿는다.
 * robots.txt 는 /co/ 만 막고 있어 이 경로와 무관하고, 약관의 크롤러 조항(제10조 ①9)도
 * '로그인 자동화'와 '개인정보 포함 서비스'로 한정돼 있어 여기 걸리지는 않는다. 남는 건
 * 수집 자체가 아니라 **수집 후 용도**다. 사전승낙이나 공공데이터 제공신청으로 정리되기 전까지
 * 배치로 상시 적재하지 마라.
 *
 * 호출 흐름은 2단계다.
 *   1. GET  /ra/hosp/hospInfoAjax.do?ykiho=<암호화 ykiho>  → HTML 에서 숫자 ID 추출
 *   2. POST /ra/eval/diagAmtInfoAjax.do  (form: ykiho=<숫자 ID>)  → JSON
 *
 * 2번은 숫자 ID 만 있으면 되므로 **매핑을 저장해 두면 1번을 영구히 건너뛸 수 있다**(요청 수 절반).
 * 숫자 ID 는 연속값처럼 보이지만 **순회하지 마라** — 유효 ID 를 훑는 순간 성격이 '공개 정보 조회'
 * 에서 'ID 열거'로 바뀐다. 매핑은 반드시 @krdata/hira 의 기관 목록에서 받은 ykiho 로만 채운다.
 */
export class HiraNpayClient {
  private readonly config: ReturnType<typeof resolveConfig>;
  private readonly gate: RateGate;

  constructor(config: HiraWebConfig = {}) {
    this.config = resolveConfig(config);
    this.gate = new RateGate(this.config.minIntervalMs);
  }

  /**
   * step1. 암호화 ykiho(@krdata/hira 가 주는 그 값) → 숫자 기관 ID.
   *
   * 결과를 캐시해 두면 이후로는 fetchItems 만 부르면 된다.
   */
  async resolveHospitalId(encryptedYkiho: string): Promise<string> {
    const url = hospitalPageUrl(this.config.baseUrl, encryptedYkiho);

    await this.gate.wait();
    const { body } = await sendWithRetry(
      url,
      {
        method: 'GET',
        headers: {
          Accept: 'text/html',
          // 사이트 안에서 넘어온 흐름을 따른다. step2 의 Referer 와 같은 취지다.
          // **Origin 은 붙이지 않는다** — 브라우저는 same-origin GET 에 Origin 을 보내지 않는다.
          // 붙이는 순간 오히려 브라우저가 아니라는 표식이 된다(step2 는 POST 라 붙는 게 맞다).
          Referer: this.config.baseUrl,
        },
      },
      this.config,
    );

    const hospitalId = HOSPITAL_ID_PATTERN.exec(body)?.[1];
    if (!hospitalId) {
      // 마크업이 바뀌었거나 없는 기관이다. 어느 쪽이든 조용히 넘어가면 안 된다.
      throw new HiraWebError(
        `hospital id not found in page for ykiho=${encryptedYkiho} (마크업이 바뀌었는지 확인하라)`,
        'NO_HOSPITAL_ID',
        { responseBody: body.slice(0, 500) },
      );
    }
    return hospitalId;
  }

  /**
   * step2. 숫자 기관 ID 로 비급여 항목을 가져온다.
   *
   * encryptedYkiho 는 **응답에 아무 영향이 없다** — 오직 Referer 를 원래 페이지 흐름대로
   * 채우기 위해 받는다. 서버가 검사하지 않지만(http.ts 의 hospitalPageUrl 주석 참고) 항상 붙인다.
   * 그래서 옵션이 아니라 필수 인자다 — 빼먹을 수 없게 하려는 것이다.
   */
  async fetchItems(hospitalId: string, encryptedYkiho: string): Promise<ListNpayResult> {
    const url = `${this.config.baseUrl}/ra/eval/diagAmtInfoAjax.do`;

    await this.gate.wait();
    const { body } = await sendWithRetry(
      url,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Origin: this.config.baseUrl,
          Referer: hospitalPageUrl(this.config.baseUrl, encryptedYkiho),
        },
        body: new URLSearchParams({ ykiho: hospitalId }).toString(),
      },
      this.config,
    );

    let parsed: NpayResponse;
    try {
      parsed = JSON.parse(body) as NpayResponse;
    } catch (error) {
      // 세션 만료 등으로 HTML 로그인 페이지가 오면 여기로 떨어진다.
      throw new HiraWebError(
        `HIRA web returned an unparseable body for hospitalId=${hospitalId}`,
        'PARSE',
        { cause: error, responseBody: body.slice(0, 500) },
      );
    }

    if (parsed.failed) {
      throw new HiraWebError(`HIRA web reported failure for hospitalId=${hospitalId}`, 'FAILED', {
        responseBody: body.slice(0, 500),
      });
    }

    return {
      hospitalId,
      items: parsed.data?.npayPubList ?? [],
      published: parsed.data?.npayPubListGbn === 'Y',
    };
  }

  /**
   * step1 + step2. 암호화 ykiho 하나로 비급여 전 항목을 받는다.
   *
   * 매 호출마다 요청 2번이다. 다건을 돌릴 거면 resolveHospitalId 결과를 저장해 두고
   * 다음부터는 fetchItems 만 부르는 편이 낫다.
   */
  async listNonPaymentItems(encryptedYkiho: string): Promise<ListNpayResult> {
    const hospitalId = await this.resolveHospitalId(encryptedYkiho);
    return this.fetchItems(hospitalId, encryptedYkiho);
  }
}
