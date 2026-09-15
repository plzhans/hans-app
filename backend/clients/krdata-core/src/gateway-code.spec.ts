import { classifyKrDataFailure, KRDATA_GATEWAY_CODES } from './gateway-code';

/**
 * 표에 줄을 더할 때 걸려야 하는 것들. 코드는 사람이 손으로 옮겨 적는 자리라
 * 오타·중복이 조용히 들어오기 쉽다.
 */
describe('KRDATA_GATEWAY_CODES', () => {
  it('errMsg 가 겹치지 않는다', () => {
    const seen = KRDATA_GATEWAY_CODES.map((entry) => entry.errMsg);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('번호순으로 적혀 있다', () => {
    const codes = KRDATA_GATEWAY_CODES.map((entry) => entry.code);
    expect(codes).toEqual([...codes].sort());
  });

  it('재시도 코드에만 최소 대기를 준다', () => {
    for (const entry of KRDATA_GATEWAY_CODES) {
      if (entry.minDelayMs !== undefined) {
        expect(entry.disposition).toBe('retry');
      }
    }
  });

  it('설명은 영어로 쓴다 — 로그로 나가는 문장이다', () => {
    for (const entry of KRDATA_GATEWAY_CODES) {
      expect(entry.summary).not.toMatch(/[가-힣]/);
    }
  });
});

describe('classifyKrDataFailure', () => {
  it('errMsg 로 찾는다', () => {
    const verdict = classifyKrDataFailure({
      status: 400,
      code: '10',
      errMsg: 'INVALID_REQUEST_PARAMETER_ERROR',
    });
    expect(verdict.disposition).toBe('retry');
    expect(verdict.known).toBe(true);
  });

  it('일일 한도(22)와 초당 한도(23)를 가른다', () => {
    expect(
      classifyKrDataFailure({ errMsg: 'LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR' })
        .disposition,
    ).toBe('quota');

    const perSecond = classifyKrDataFailure({
      errMsg: 'LIMITED_NUMBER_OF_SERVICE_REQUESTS_PER_SECOND_EXCEEDS_ERROR',
    });
    expect(perSecond.disposition).toBe('retry');
    expect(perSecond.minDelayMs).toBeGreaterThanOrEqual(1_000);
  });

  it('errMsg 가 없으면 번호로 떨어진다', () => {
    // 20 은 errMsg 셋이 나눠 쓰지만 방침이 같아 번호만으로도 답할 수 있다.
    const verdict = classifyKrDataFailure({ status: 401, code: '20' });
    expect(verdict.disposition).toBe('fail');
    expect(verdict.keyRelated).toBe(true);
  });

  it('키가 원인일 수 있는 코드만 키를 비친다', () => {
    expect(
      classifyKrDataFailure({ errMsg: 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR' }).keyRelated,
    ).toBe(true);
    // IP 차단은 키와 무관하다. 여기서 키를 찍으면 엉뚱한 곳을 보게 만든다.
    expect(classifyKrDataFailure({ errMsg: 'BLACKLIST_IP_ACCESS_ERROR' }).keyRelated).toBe(false);
  });

  it('표에 없는 코드는 실패로 두되 모른다고 표시한다', () => {
    const verdict = classifyKrDataFailure({ status: 400, code: '99', errMsg: 'SOMETHING_NEW' });
    expect(verdict.disposition).toBe('fail');
    expect(verdict.known).toBe(false);
  });

  it('봉투를 못 읽으면 상태코드로 판정한다', () => {
    expect(classifyKrDataFailure({ status: 429 }).disposition).toBe('quota');
    expect(classifyKrDataFailure({ status: 503 }).disposition).toBe('retry');
    expect(classifyKrDataFailure({ status: 404 }).disposition).toBe('fail');
  });

  it('봉투 없이 본문으로만 오는 한도 초과를 잡는다', () => {
    expect(
      classifyKrDataFailure({ status: 400, body: 'API token quota exceeded' }).disposition,
    ).toBe('quota');
  });
});
