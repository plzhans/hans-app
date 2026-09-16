import { KrDataError, KrDataQuotaError } from './error';
import { createKrDataFetch } from './http';

/** 게이트웨이 오류 봉투. JSON 으로도 XML 로도, 200 으로도 4xx 로도 오는 그 모양이다. */
function gatewayBody(errMsg: string, code: string): string {
  return JSON.stringify({
    OpenAPI_ServiceResponse: {
      cmmMsgHeader: { errMsg, returnAuthMsg: '안내 문구', returnReasonCode: code },
    },
  });
}

const OK_BODY = JSON.stringify({
  response: {
    header: { resultCode: '00', resultMsg: 'OK' },
    body: { items: { item: [{ a: 1 }] } },
  },
});

/** 미리 정한 응답을 순서대로 돌려준다. 다 쓰면 마지막 것을 반복한다. */
function stubFetch(replies: { status: number; body: string }[]): () => number {
  let calls = 0;
  globalThis.fetch = jest.fn(() => {
    const reply = replies[Math.min(calls, replies.length - 1)];
    calls += 1;
    return Promise.resolve(
      new Response(reply.body, {
        status: reply.status,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });
  return () => calls;
}

const realFetch = globalThis.fetch;
afterAll(() => {
  globalThis.fetch = realFetch;
});

// 대기까지 실제로 재현하면 느려진다. 기준값을 1ms 로 낮춰 흐름만 본다
// (코드가 요구하는 최소 대기는 이 값과 무관하게 지켜진다 — 아래 23 테스트).
const fetcher = createKrDataFetch({
  serviceKey: 'TESTKEY1234',
  baseUrl: 'https://example.test/1234567',
  retryDelayMs: 1,
});

describe('createKrDataFetch 재시도', () => {
  it('게이트웨이가 400 을 흘려도 다시 부르면 살아난다', async () => {
    const calls = stubFetch([
      { status: 400, body: gatewayBody('INVALID_REQUEST_PARAMETER_ERROR', '10') },
      { status: 400, body: gatewayBody('INVALID_REQUEST_PARAMETER_ERROR', '10') },
      { status: 200, body: OK_BODY },
    ]);

    const response = await fetcher('/svc/op?pageNo=1');

    expect(response.status).toBe(200);
    expect(calls()).toBe(3);
  });

  it('HTTP 200 에 실려 온 오류도 재시도 대상이다', async () => {
    // 상태코드만 보면 성공이라 루프 밖에서 해석하면 영영 재시도되지 않는다.
    const calls = stubFetch([
      { status: 200, body: gatewayBody('SERVICETIMEOUT_ERROR', '05') },
      { status: 200, body: OK_BODY },
    ]);

    await fetcher('/svc/op');

    expect(calls()).toBe(2);
  });

  it('초당 한도는 최소 1초를 쉬고 다시 부른다', async () => {
    const calls = stubFetch([
      {
        status: 200,
        body: gatewayBody('LIMITED_NUMBER_OF_SERVICE_REQUESTS_PER_SECOND_EXCEEDS_ERROR', '23'),
      },
      { status: 200, body: OK_BODY },
    ]);

    const startedAt = Date.now();
    await fetcher('/svc/op');

    expect(calls()).toBe(2);
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(1_000);
  });

  /*
    **상태코드와 헤더가 없으면 원인을 못 좁힌다.** 같은 게이트웨이 오류가 어떤 날은 200 으로
    어떤 날은 5xx 로 오는데, 200 이면 게이트웨이가 정책으로 거절한 것이고 5xx 면 인프라가
    흔들린 것이다. 그 구별이 로그에 안 남아 운영에서 아흐레를 못 밝힌 적이 있다.
  */
  it('실패에 HTTP 상태와 응답 헤더를 함께 남긴다', async () => {
    stubFetch([{ status: 200, body: gatewayBody('NO_OPENAPI_SERVICE_ERROR', '12') }]);

    const error = await fetcher('/svc/op').then(
      () => undefined,
      (e: unknown) => e as KrDataError,
    );

    expect(error).toBeInstanceOf(KrDataError);
    if (!error) throw new Error('오류가 나야 한다');
    expect(error.httpStatus).toBe(200);
    expect(error.responseHeaders).toContain('content-type=application/json');
    // 이력 표에는 메시지 한 줄만 남는다. 거기에도 상태가 있어야 한다.
    expect(error.message).toContain('[HTTP 200]');
  });

  it('소진하면 시도 횟수를 메시지에 남긴다', async () => {
    const calls = stubFetch([{ status: 400, body: gatewayBody('NO_OPENAPI_SERVICE_ERROR', '12') }]);

    await expect(fetcher('/svc/op')).rejects.toThrow(/after 3 attempts/);
    expect(calls()).toBe(3);
  });
});

describe('createKrDataFetch 즉시 실패', () => {
  it('미등록 키는 한 번만 부르고 포기한다', async () => {
    const calls = stubFetch([
      { status: 403, body: gatewayBody('SERVICE_KEY_IS_NOT_REGISTERED_ERROR', '30') },
    ]);

    const error = await fetcher('/svc/op').catch((caught: unknown) => caught);

    expect(calls()).toBe(1);
    expect(error).toBeInstanceOf(KrDataError);
    expect((error as KrDataError).errorCode).toBe('30');
    expect((error as KrDataError).disposition).toBe('fail');
  });

  it('키는 앞 다섯 글자만 남긴다 — 이 메시지는 DB 에 적힌다', async () => {
    stubFetch([{ status: 403, body: gatewayBody('SERVICE_KEY_IS_NOT_REGISTERED_ERROR', '30') }]);

    const error = (await fetcher('/svc/op').catch((caught: unknown) => caught)) as KrDataError;

    expect(error.message).toContain('TESTK****');
    expect(error.message).not.toContain('TESTKEY1234');
  });

  it('일일 한도는 실패가 아니라 한도 예외다', async () => {
    const calls = stubFetch([
      {
        status: 200,
        body: gatewayBody('LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR', '22'),
      },
    ]);

    const error = await fetcher('/svc/op').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(KrDataQuotaError);
    expect(calls()).toBe(1);
  });

  it('어느 API 가 막혔는지 메시지 앞에 붙인다', async () => {
    stubFetch([{ status: 403, body: gatewayBody('SERVICE_KEY_IS_NOT_REGISTERED_ERROR', '30') }]);

    const error = (await fetcher('/svc/op?pageNo=1').catch(
      (caught: unknown) => caught,
    )) as KrDataError;

    expect(error.message.startsWith('[svc/op]')).toBe(true);
    // 쿼리는 통째로 버린다 — 서비스키가 거기 있다.
    expect(error.message).not.toContain('pageNo');
  });
});
