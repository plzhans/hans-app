import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { JwtVerifyError } from './jwt-error';
import { publicPemFromJwk, readJwtHeader, type AccessAlg } from './jwt-keygen';

/**
 * 받아들일 알고리즘. **EC 만이다.**
 *
 * 저쪽이 보낸 JWKS 를 그대로 믿고 alg 를 정하면, 그 문서가 `none` 이나 `HS256` 을 말하는 순간
 * 검증이 무력해진다(HS256 이면 "공개키" 가 곧 대칭 비밀이 되어 누구나 서명할 수 있다).
 * 우리가 아는 목록에 없으면 그 키를 버린다.
 */
const ACCEPTED_ALGS = new Set<AccessAlg>(['ES256', 'ES384', 'ES512']);

/** JWKS 를 받아 올 때 기다리는 시간. 못 받으면 검증에 실패한다. */
const FETCH_TIMEOUT_MS = 3_000;

/**
 * 모르는 kid 를 만났을 때 다시 받아 오는 최소 간격.
 *
 * **없으면 위조 토큰 하나가 곧 요청 폭주가 된다** — kid 를 아무 값으로나 넣어 보내면
 * 그때마다 저쪽을 두드리게 된다. 정상적인 키 교체는 드물어 이 간격으로 충분하다.
 */
const REFETCH_COOLDOWN_MS = 30_000;

interface CachedKey {
  readonly alg: AccessAlg;
  readonly publicPem: string;
}

/**
 * 남이 서명한 토큰을 그쪽 JWKS 로 검증한다.
 *
 * **공개키 사본을 설정에 두지 않는 것이 요점이다.** 사본을 박아 두면 서명하는 쪽이 키를
 * 바꿀 때마다 이쪽도 배포해야 한다 — 이 서비스와 아무 상관 없는 이유로 재배포가 생긴다.
 * 주소만 알고 있다가 모르는 kid 를 만나면 그때 받아 오면 된다.
 *
 * 받은 키는 kid 별로 들고 있는다. 정상 흐름에서는 부팅 뒤 첫 요청 한 번만 네트워크를 탄다.
 */
export class RemoteJwksVerifier {
  private readonly logger: Logger;
  private readonly jwt = new JwtService({});
  private readonly keys = new Map<string, CachedKey>();
  private lastFetchAt = 0;
  private fetching?: Promise<void>;

  /**
   * @param jwksUrl 공개키셋 주소.
   * @param audience 이 토큰이 나를 향한 것인지. **같은 키로 서명된 다른 용도의 토큰을 거르는
   *   유일한 장치다** — 발급자는 키 하나로 여러 대상에게 서명한다.
   * @param issuer 받아들일 발급자. 비우면 iss 를 검사하지 않는다.
   */
  constructor(
    private readonly jwksUrl: string,
    private readonly audience: string,
    private readonly issuer?: string,
    label = RemoteJwksVerifier.name,
  ) {
    this.logger = new Logger(label);
  }

  async verify<T extends object = Record<string, unknown>>(token: string): Promise<T> {
    const kid = readJwtHeader(token).kid;
    if (!kid) {
      // kid 가 없다 = 비대칭으로 서명한 토큰이 아니다. 우리가 검증할 수 있는 종류가 아니다.
      throw new JwtVerifyError('Unknown or missing key id.');
    }

    let key = this.keys.get(kid);
    if (!key) {
      await this.refresh();
      key = this.keys.get(kid);
    }
    if (!key) {
      throw new JwtVerifyError('Unknown or missing key id.');
    }

    try {
      return this.jwt.verify<T>(token, {
        publicKey: key.publicPem,
        // 키가 정한 alg 만 받는다. 목록을 넓히면 토큰 헤더의 alg 를 믿는 꼴이 된다.
        algorithms: [key.alg],
        audience: this.audience,
        ...(this.issuer ? { issuer: this.issuer } : {}),
      });
    } catch {
      // 만료·서명 불일치·aud 불일치를 갈라 알려 주지 않는다.
      throw new JwtVerifyError();
    }
  }

  /** 지금 들고 있는 키가 있나. 부팅 직후 상태를 로그에 남기는 데 쓴다. */
  get keyCount(): number {
    return this.keys.size;
  }

  /**
   * JWKS 를 다시 받아 온다. **동시에 여러 요청이 들어와도 한 번만 나간다.**
   *
   * 실패해도 던지지 않는다 — 들고 있던 키로 검증되는 토큰은 계속 통과해야 한다.
   * 정말 못 고르면 위에서 kid 를 못 찾아 거절된다.
   */
  async refresh(): Promise<void> {
    if (this.fetching) {
      await this.fetching;
      return;
    }
    const since = Date.now() - this.lastFetchAt;
    if (since < REFETCH_COOLDOWN_MS) {
      return;
    }

    const run = this.fetchKeys();
    this.fetching = run;
    try {
      await run;
    } finally {
      this.fetching = undefined;
    }
  }

  private async fetchKeys(): Promise<void> {
    this.lastFetchAt = Date.now();
    let body: { keys?: unknown };
    try {
      const response = await fetch(this.jwksUrl, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!response.ok) {
        this.logger.warn(`JWKS fetch failed: HTTP ${response.status} (${this.jwksUrl})`);
        return;
      }
      body = (await response.json()) as { keys?: unknown };
    } catch (error) {
      this.logger.warn(`Could not reach the JWKS endpoint ${this.jwksUrl}: ${describe(error)}`);
      return;
    }

    if (!Array.isArray(body.keys)) {
      this.logger.warn(`JWKS has no key array (${this.jwksUrl})`);
      return;
    }

    /*
      **받은 것으로 통째로 갈아끼운다.** 지운 키를 남겨 두면 퇴역시킨 키로 서명한 토큰이
      계속 통과한다 — 키를 내리는 행위가 아무 효력이 없어진다.
    */
    const next = new Map<string, CachedKey>();
    for (const raw of body.keys) {
      const jwk = raw as Record<string, unknown>;
      const kid = typeof jwk.kid === 'string' ? jwk.kid : undefined;
      const alg = jwk.alg as AccessAlg | undefined;
      if (!kid || !alg || !ACCEPTED_ALGS.has(alg)) {
        this.logger.warn(`Skip key from JWKS (kid=${String(jwk.kid)} alg=${String(jwk.alg)})`);
        continue;
      }
      try {
        next.set(kid, { alg, publicPem: publicPemFromJwk(jwk) });
      } catch (error) {
        this.logger.warn(`Skip key ${kid}: ${describe(error)}`);
      }
    }

    if (next.size === 0) {
      /*
        빈 키셋은 "아직 비대칭으로 안 바꿨다" 는 뜻일 수 있다(발급자가 대칭키로 서명 중).
        들고 있던 것을 지우지는 않는다 — 저쪽이 잠깐 잘못 뜬 경우와 구별할 수 없어서다.
      */
      this.logger.warn(`JWKS is empty (${this.jwksUrl}) — the issuer may be signing with HS256`);
      return;
    }

    this.keys.clear();
    for (const [kid, key] of next) this.keys.set(kid, key);
    this.logger.log(`Loaded ${this.keys.size} public key(s) from ${this.jwksUrl}`);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
