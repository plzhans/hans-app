import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { JwtVerifyError } from './jwt-error';
import {
  algForCurve,
  jwkThumbprint,
  publicJwkFromPem,
  publicPemFromJwk,
  readJwtHeader,
  type AccessAlg,
} from './jwt-keygen';

const KNOWN_ALGS = new Set<AccessAlg>(['ES256', 'ES384', 'ES512']);

/** 키 디렉터리 옵션. 경로는 cwd 기준이다(컨테이너는 /app). */
export interface JwtKeyStoreOptions {
  /**
   * 비대칭 서명 키 디렉터리. **비우면 대칭(HS256) 폴백이다.**
   *
   * 값을 **명시했는데** 활성 키가 없으면 부팅을 거부한다 — 조용한 강등은 보안이 내려간 것을
   * 아무도 모르게 만든다. 기본 경로를 쓸 때만 폴백한다.
   */
  readonly keyDir?: string;
  /** keyDir 이 없을 때 쓸 대칭 서명 키. */
  readonly fallbackSecret: string;
  /** sign 에 박을 발급자. 없으면 iss 를 넣지 않는다. */
  readonly issuer?: string;
  /** verify 에서 허용할 iss 목록. 비면 iss 를 검사하지 않는다. */
  readonly allowedIssuers: readonly string[];
  /** 서명하는 토큰의 기본 수명(초). */
  readonly tokenTtlSec: number;
  /** 로그에 찍을 이름. 한 프로세스에 여러 벌이 뜰 수 있어 구별이 필요하다. */
  readonly label?: string;
}

/** 한 번 서명할 때의 조정값. 대상(aud)과 수명은 토큰 종류마다 다르다. */
export interface JwtSignOptions {
  /** 이 토큰을 받을 쪽. 넣으면 검증하는 쪽이 같은 값을 요구해야 통과한다. */
  readonly audience?: string;
  /** 수명(초). 안 주면 tokenTtlSec. */
  readonly expiresInSec?: number;
}

/** 한 번 검증할 때의 조정값. */
export interface JwtVerifyOptions {
  /**
   * 내가 받아야 할 토큰인가.
   *
   * **같은 키로 서명된 다른 용도의 토큰을 걸러내는 유일한 장치다.** 발급자 키 하나가
   * 여러 대상을 위해 서명하므로(OIDC 가 그렇다), 이 값을 빠뜨리면 남의 토큰이 통과한다.
   */
  readonly audience?: string;
}

/** keyDir 미지정 시 볼 기본 디렉터리(cwd 기준). 없으면 HS256 폴백이다. */
const DEFAULT_KEY_DIR = 'config/jwt';

interface LoadedKey {
  readonly kid: string;
  readonly alg: AccessAlg;
  /** SPKI PEM(검증용). */
  readonly publicPem: string;
  /** 활성 키만 보유(서명용). retired 는 undefined. */
  readonly privatePem?: string;
  /** JWKS 로 노출할 공개 JWK(kid·alg·use 포함, d 없음). */
  readonly jwk: Record<string, unknown>;
}

/**
 * JWT 서명·검증 키 관리자 + JWKS.
 *
 * **발급하는 쪽과 검증하는 쪽이 같은 규칙을 봐야 해서 한 곳에 뒀다.** kid 를 어떻게 계산하고
 * 파일명을 어떻게 읽고 alg 를 어디서 정하는지가 갈리면, 발급은 되는데 검증만 조용히 실패한다.
 *
 * **도메인을 모른다.** 어떤 토큰인지(사용자 access token · 관리자 access token · 서비스 간 요청)는
 * 부르는 쪽이 정하고, 여기는 서명과 키만 다룬다 — 그래서 소비자가 셋 이상이 된 지금 이 자리다.
 *
 * keyDir 이 있으면 **비대칭(ES256)** — 개인키로 서명, 공개키(JWKS)로 검증한다.
 *   dir: `<kid>_<alg>.key`(활성 개인키) · `retired/<kid>_<alg>.pub`(검증 전용 공개키)
 *   부팅 때 전부 읽어 kid(thumbprint)를 계산하고 메모리 맵을 만든다. 런타임엔 파일을 다시 안 본다.
 *   모르는 kid 토큰은 거부한다(로드된 키만 신뢰).
 * 없으면 **대칭(HS256, jwtSecret)** 으로 폴백한다(레거시/미이관 환경).
 *
 * 소셜 티켓(HS256)·refresh(opaque)는 이 서비스가 아니라 별도 경로를 쓴다 — access token 전용이다.
 */
@Injectable()
export class JwtKeyStore {
  protected readonly logger: Logger;
  /** 키를 옵션으로 넘겨 쓰는 무설정 인스턴스. 모듈 JwtService(HS256)와 분리한다. */
  private readonly jwt = new JwtService({});
  private readonly keys = new Map<string, LoadedKey>();
  private readonly asymmetric: boolean;
  private activeKid: string | null = null;

  constructor(protected readonly options: JwtKeyStoreOptions) {
    this.logger = new Logger(options.label ?? JwtKeyStore.name);
    const explicit = options.keyDir;
    const dir = explicit ?? DEFAULT_KEY_DIR;
    this.asymmetric = this.loadKeys(dir) > 0;
    if (this.asymmetric) return;
    // 키가 없다 → HS256 폴백. 단, 경로를 **명시**했는데 키가 없으면 설정 실수이므로
    // 조용한 강등(보안 저하) 대신 부팅을 거부한다. 미지정(기본 경로)일 때만 폴백한다.
    if (explicit) {
      throw new Error(`No active signing key (*.key) in ${explicit}.`);
    }
    this.logger.warn(`No JWT signing keys in ${dir} — tokens use HS256 (symmetric fallback).`);
  }

  // ---- 발급 / 검증 ----

  /** 서명한다. 비대칭이면 활성 개인키(ES256, kid 헤더), 아니면 HS256. */
  sign(payload: object, signOptions: JwtSignOptions = {}): string {
    const common = {
      expiresIn: signOptions.expiresInSec ?? this.options.tokenTtlSec,
      ...(this.options.issuer ? { issuer: this.options.issuer } : {}),
      ...(signOptions.audience ? { audience: signOptions.audience } : {}),
    };
    if (!this.asymmetric) {
      return this.jwt.sign(payload, {
        ...common,
        secret: this.options.fallbackSecret,
        algorithm: 'HS256',
      });
    }
    const key = this.keys.get(this.activeKid as string) as LoadedKey;
    return this.jwt.sign(payload, {
      ...common,
      privateKey: key.privatePem,
      algorithm: key.alg,
      keyid: key.kid,
    });
  }

  /** 검증한다. 비대칭이면 헤더 kid 로 공개키를 골라 검증한다(모르는 kid 는 거부). */
  verify<T extends object = Record<string, unknown>>(
    token: string,
    verifyOptions: JwtVerifyOptions = {},
  ): T {
    try {
      return this.verifyOrThrow<T>(token, verifyOptions);
    } catch (error) {
      // 만료·서명 불일치·kid 불명을 갈라 알려 주지 않는다. 공격자에게 주는 힌트다.
      if (error instanceof JwtVerifyError) throw error;
      throw new JwtVerifyError();
    }
  }

  private verifyOrThrow<T extends object>(token: string, verifyOptions: JwtVerifyOptions): T {
    const common = verifyOptions.audience ? { audience: verifyOptions.audience } : {};
    let payload: T;
    if (!this.asymmetric) {
      payload = this.jwt.verify<T>(token, {
        ...common,
        secret: this.options.fallbackSecret,
        algorithms: ['HS256'],
      });
    } else {
      const kid = readJwtHeader(token).kid;
      const key = kid ? this.keys.get(kid) : undefined;
      if (!key) {
        throw new JwtVerifyError('Unknown or missing key id.');
      }
      payload = this.jwt.verify<T>(token, {
        ...common,
        publicKey: key.publicPem,
        // **키가 정한 alg 만 받는다.** 목록을 넓히면 토큰 헤더의 alg 를 믿는 꼴이라
        // alg 혼동 공격(none·키 종류 바꿔치기)이 열린다.
        algorithms: [key.alg],
      });
    }
    // iss(발급처) 허용목록 검사. @nestjs/jwt 의 issuer 옵션은 단일 문자열만 받아, 다중 허용을 직접 대조한다.
    this.assertIssuer(payload);
    return payload;
  }

  /** payload.iss 가 허용 발급처 목록에 있는지 검사한다. 목록이 비면 검사하지 않는다. */
  private assertIssuer(payload: object): void {
    const allowed = this.options.allowedIssuers;
    if (allowed.length === 0) return;
    const iss = (payload as { iss?: unknown }).iss;
    if (typeof iss !== 'string' || !allowed.includes(iss)) {
      throw new JwtVerifyError('Untrusted token issuer.');
    }
  }

  /** 비대칭으로 서명하고 있나. 거짓이면 JWKS 가 비어 있다(대칭 폴백). */
  get isAsymmetric(): boolean {
    return this.asymmetric;
  }

  /** 지금 서명에 쓰는 키들의 alg 목록. discovery 문서를 만드는 쪽이 쓴다. */
  algs(): string[] {
    return [...new Set([...this.keys.values()].map((k) => k.alg))];
  }

  /** JWKS(공개키셋). 대칭 폴백 모드면 빈 배열(노출할 공개키 없음). */
  jwks(): { keys: Record<string, unknown>[] } {
    return { keys: [...this.keys.values()].map((k) => k.jwk) };
  }

  // ---- 로딩 ----

  /** 키 디렉터리를 읽어 맵을 채우고 **활성 키 개수**를 돌려준다. 디렉터리·키가 없어도 던지지 않는다(0 반환). */
  private loadKeys(dir: string): number {
    if (!existsSync(dir)) {
      return 0;
    }
    const actives = this.loadDir(dir, '.key', true);
    const retiredDir = join(dir, 'retired');
    if (existsSync(retiredDir)) {
      this.loadDir(retiredDir, '.pub', false);
    }
    if (actives.length === 0) {
      return 0;
    }
    // 단일 활성 전제. 멀티 활성(멀티리전 등)은 추후 선택 정책으로 확장한다.
    this.activeKid = actives[0].kid;
    if (actives.length > 1) {
      this.logger.warn(`Multiple active keys found; signing with ${this.activeKid}.`);
    }
    this.logger.log(`Loaded ${this.keys.size} signing key(s); active=${this.activeKid}.`);
    return actives.length;
  }

  private loadDir(dir: string, ext: string, isPrivate: boolean): LoadedKey[] {
    const loaded: LoadedKey[] = [];
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(ext)) continue;
      const parsed = this.parseName(file, ext);
      if (!parsed) {
        this.logger.warn(`Skip key file (bad name): ${file}`);
        continue;
      }
      try {
        const key = this.buildKey(readFileSync(join(dir, file), 'utf8'), parsed.alg, isPrivate);
        // **kid 는 내용에서 계산한 thumbprint 다. 파일명은 사람이 읽는 이름일 뿐이다.**
        //
        // 예전에는 파일명의 kid 가 thumbprint 와 다르면 키를 통째로 건너뛰었다. 손 rename
        // 사고를 막으려던 것인데, 대가가 컸다 — 키가 하나도 안 남으면 부팅이 거부되고,
        // 로그의 경고 한 줄이 원인이라는 걸 알아채기 어렵다. 실제로 D001_ES256.key 가
        // 그렇게 조용히 빠져 서버가 못 떴다.
        //
        // 파일명이 틀려도 위험하지 않다. 발급한 토큰의 kid 헤더는 여기서 계산한 값이고,
        // 검증도 그 값으로 찾는다. 파일명은 아무 데도 안 쓰인다.
        if (key.kid !== parsed.kid) {
          this.logger.log(`${file}: kid=${key.kid} (filename ${parsed.kid} is a label only)`);
        }
        this.keys.set(key.kid, key);
        loaded.push(key);
      } catch (e) {
        this.logger.warn(`Skip ${file}: ${(e as Error).message}`);
      }
    }
    return loaded;
  }

  /** `<kid>_<alg>.<ext>` 를 분해한다. alg 는 마지막 '_' 뒤(알려진 alg 목록과 대조). */
  private parseName(file: string, ext: string): { kid: string; alg: AccessAlg } | null {
    const stem = file.slice(0, file.length - ext.length);
    const sep = stem.lastIndexOf('_');
    if (sep <= 0) return null;
    const kid = stem.slice(0, sep);
    const alg = stem.slice(sep + 1) as AccessAlg;
    if (!KNOWN_ALGS.has(alg)) return null;
    return { kid, alg };
  }

  private buildKey(pem: string, alg: AccessAlg, isPrivate: boolean): LoadedKey {
    const publicJwk = publicJwkFromPem(pem, isPrivate);
    const kid = jwkThumbprint(publicJwk);
    const implied = algForCurve(publicJwk.crv);
    if (implied && implied !== alg) {
      this.logger.warn(`Key ${kid}: filename alg=${alg} but curve implies ${implied}.`);
    }
    const publicPem = publicPemFromJwk(publicJwk);
    return {
      kid,
      alg,
      publicPem,
      privatePem: isPrivate ? pem : undefined,
      jwk: { ...publicJwk, kid, alg, use: 'sig' },
    };
  }
}
