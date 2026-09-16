import { JwtService } from '@nestjs/jwt';

import { generateAccessKeyPair, publicJwkFromPem, type GeneratedKey } from './jwt-keygen';
import { RemoteJwksVerifier } from './remote-jwks.verifier';
import { JwtVerifyError } from './jwt-error';

const AUDIENCE = 'hansapp-batch';
const JWKS_URL = 'http://admin:3001/.well-known/jwks.json';

const jwt = new JwtService({});
let key: GeneratedKey;

/** 이 키의 공개 JWK 하나짜리 키셋. alg 를 덮어써 "저쪽이 이상한 값을 말하는" 경우를 만든다. */
function jwks(alg: string = key.alg): { keys: Record<string, unknown>[] } {
  const jwk = publicJwkFromPem(key.publicPem, false);
  return { keys: [{ ...jwk, kid: key.kid, alg, use: 'sig' }] };
}

function serve(body: unknown): void {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) });
}

function sign(claims: object, options: { audience?: string } = {}): string {
  return jwt.sign(claims, {
    privateKey: key.privatePem,
    algorithm: key.alg,
    keyid: key.kid,
    expiresIn: 30,
    ...(options.audience === undefined ? { audience: AUDIENCE } : { audience: options.audience }),
  });
}

function verifier(): RemoteJwksVerifier {
  return new RemoteJwksVerifier(JWKS_URL, AUDIENCE);
}

beforeAll(() => {
  key = generateAccessKeyPair('ES256');
});

describe('RemoteJwksVerifier', () => {
  it('서명이 맞고 대상이 나면 클레임을 그대로 준다', async () => {
    serve(jwks());
    const claims = await verifier().verify<{ job: string; force: boolean }>(
      sign({ sub: '7', job: 'hira', force: true }),
    );
    expect(claims.job).toBe('hira');
    expect(claims.force).toBe(true);
  });

  /*
    **이 검사가 빠지면 조용히 뚫린다.** 관리자 access token 은 같은 키로 서명되므로
    (발급자 키 하나가 여러 대상에게 서명하는 것은 정상이다), aud 를 안 보면 관리자가
    로그인할 때 받은 토큰을 그대로 들이밀어 적재를 돌릴 수 있다.
  */
  it('다른 대상에게 발급된 토큰은 거절한다', async () => {
    serve(jwks());
    await expect(
      verifier().verify(
        sign({ sub: '7', job: 'hira', force: false }, { audience: 'hansapp-admin' }),
      ),
    ).rejects.toBeInstanceOf(JwtVerifyError);
  });

  it('aud 가 아예 없는 토큰도 거절한다', async () => {
    serve(jwks());
    const token = jwt.sign(
      { sub: '7', job: 'hira', force: false },
      {
        privateKey: key.privatePem,
        algorithm: key.alg,
        keyid: key.kid,
        expiresIn: 30,
      },
    );
    await expect(verifier().verify(token)).rejects.toBeInstanceOf(JwtVerifyError);
  });

  it('키셋에 없는 kid 는 거절한다', async () => {
    const other = generateAccessKeyPair('ES256');
    serve(jwks());
    const token = jwt.sign(
      { sub: '7', job: 'hira', force: false },
      {
        privateKey: other.privatePem,
        algorithm: other.alg,
        keyid: other.kid,
        audience: AUDIENCE,
        expiresIn: 30,
      },
    );
    await expect(verifier().verify(token)).rejects.toBeInstanceOf(JwtVerifyError);
  });

  /** 대칭키로 서명한 토큰에는 kid 가 없다. 우리가 검증할 수 있는 종류가 아니다. */
  it('HS256 으로 서명한 토큰은 거절한다', async () => {
    serve(jwks());
    const token = jwt.sign(
      { sub: '7', job: 'hira', force: false },
      { secret: 'shared-secret', algorithm: 'HS256', audience: AUDIENCE, expiresIn: 30 },
    );
    await expect(verifier().verify(token)).rejects.toBeInstanceOf(JwtVerifyError);
  });

  /*
    저쪽 문서가 말하는 alg 를 그대로 믿으면 안 된다. HS256 이라고 하면 "공개키" 가 곧
    대칭 비밀이 되어 그것을 아는 누구나 서명할 수 있다.
  */
  it('키셋이 EC 가 아닌 alg 를 말하면 그 키를 버린다', async () => {
    serve(jwks('HS256'));
    await expect(
      verifier().verify(sign({ sub: '7', job: 'hira', force: false })),
    ).rejects.toBeInstanceOf(JwtVerifyError);
  });

  it('키셋을 못 받아 오면 거절한다', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED'));
    await expect(
      verifier().verify(sign({ sub: '7', job: 'hira', force: false })),
    ).rejects.toBeInstanceOf(JwtVerifyError);
  });
});
