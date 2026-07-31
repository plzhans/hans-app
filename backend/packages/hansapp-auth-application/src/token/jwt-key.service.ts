import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createPublicKey } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { AUTH_CONFIG } from '../auth.config';
import type { AuthConfig } from '../auth.config';
import {
  algForCurve,
  jwkThumbprint,
  publicJwkFromPem,
  type AccessAlg,
} from './jwt-keygen';

const KNOWN_ALGS = new Set<AccessAlg>(['ES256', 'ES384', 'ES512']);

/**
 * AUTH_JWT_KEY_DIR 미지정 시 볼 기본 디렉터리(cwd 기준). 배포 서버는 cwd 가 배포경로라
 * 여기(config/jwt)에 키가 안착한다(배포가 config/<env>/jwt → config/jwt 로 평면화). 없으면 HS256 폴백.
 */
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
 * access token 서명·검증 키 관리자 + JWKS.
 *
 * AUTH_JWT_KEY_DIR 이 있으면 **비대칭(ES256)** — 개인키로 서명, 공개키(JWKS)로 검증한다(MSA 대비).
 *   dir: `<kid>_<alg>.key`(활성 개인키) · `retired/<kid>_<alg>.pub`(검증 전용 공개키)
 *   부팅 때 전부 읽어 kid(thumbprint)를 계산하고 메모리 맵을 만든다. 런타임엔 파일을 다시 안 본다.
 *   모르는 kid 토큰은 거부한다(로드된 키만 신뢰).
 * 없으면 **대칭(HS256, jwtSecret)** 으로 폴백한다(레거시/미이관 환경).
 *
 * 소셜 티켓(HS256)·refresh(opaque)는 이 서비스가 아니라 별도 경로를 쓴다 — access token 전용이다.
 */
@Injectable()
export class JwtKeyService {
  private readonly logger = new Logger(JwtKeyService.name);
  /** 키를 옵션으로 넘겨 쓰는 무설정 인스턴스. 모듈 JwtService(HS256, 소셜티켓용)와 분리한다. */
  private readonly jwt = new JwtService({});
  private readonly keys = new Map<string, LoadedKey>();
  private readonly asymmetric: boolean;
  private activeKid: string | null = null;

  constructor(@Inject(AUTH_CONFIG) private readonly config: AuthConfig) {
    const explicit = config.jwtKeyDir;
    const dir = explicit ?? DEFAULT_KEY_DIR;
    this.asymmetric = this.loadKeys(dir) > 0;
    if (this.asymmetric) return;
    // 키가 없다 → HS256 폴백. 단, 경로를 **명시**했는데 키가 없으면 설정 실수이므로
    // 조용한 강등(보안 저하) 대신 부팅을 거부한다. 미지정(기본 경로)일 때만 폴백한다.
    if (explicit) {
      throw new Error(
        `AUTH_JWT_KEY_DIR=${explicit} 에 활성 서명 키(*.key)가 없다.`,
      );
    }
    this.logger.warn(
      `No JWT signing keys in ${dir} — access tokens use HS256 (symmetric fallback).`,
    );
  }

  // ---- 발급 / 검증 ----

  /** access token 을 서명한다. 비대칭이면 active 개인키(ES256, kid 헤더), 아니면 HS256. */
  sign(payload: object): string {
    const common = {
      expiresIn: this.config.accessTokenTtlSec,
      ...(this.config.issuer ? { issuer: this.config.issuer } : {}),
    };
    if (!this.asymmetric) {
      return this.jwt.sign(payload, {
        ...common,
        secret: this.config.jwtSecret,
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

  /** access token 을 검증한다. 비대칭이면 헤더 kid 로 공개키를 골라 검증한다(모르는 kid 는 거부). */
  verify<T extends object = Record<string, unknown>>(token: string): T {
    let payload: T;
    if (!this.asymmetric) {
      payload = this.jwt.verify<T>(token, {
        secret: this.config.jwtSecret,
        algorithms: ['HS256'],
      });
    } else {
      const kid = this.readKid(token);
      const key = kid ? this.keys.get(kid) : undefined;
      if (!key) {
        throw new UnauthorizedException('Unknown or missing key id.');
      }
      payload = this.jwt.verify<T>(token, {
        publicKey: key.publicPem,
        algorithms: [key.alg],
      });
    }
    // iss(발급처) 허용목록 검사. @nestjs/jwt 의 issuer 옵션은 단일 문자열만 받아, 다중 허용을 직접 대조한다.
    this.assertIssuer(payload);
    return payload;
  }

  /** payload.iss 가 허용 발급처 목록에 있는지 검사한다. 목록이 비면 검사하지 않는다. */
  private assertIssuer(payload: object): void {
    const allowed = this.config.allowedIssuers;
    if (allowed.length === 0) return;
    const iss = (payload as { iss?: unknown }).iss;
    if (typeof iss !== 'string' || !allowed.includes(iss)) {
      throw new UnauthorizedException('Untrusted token issuer.');
    }
  }

  /** JWT 헤더에서 kid 를 읽는다(서명 검증 전). base64url 헤더를 직접 파싱한다. */
  private readKid(token: string): string | undefined {
    const seg = token.split('.')[0];
    if (!seg) return undefined;
    try {
      const header = JSON.parse(
        Buffer.from(seg, 'base64url').toString('utf8'),
      ) as { kid?: string };
      return typeof header.kid === 'string' ? header.kid : undefined;
    } catch {
      return undefined;
    }
  }

  /** JWKS(공개키셋). 대칭 폴백 모드면 빈 배열(노출할 공개키 없음). */
  jwks(): { keys: Record<string, unknown>[] } {
    return { keys: [...this.keys.values()].map((k) => k.jwk) };
  }

  /**
   * OAuth2/OIDC discovery 문서. 소비자(medifinder 등)는 이 하나로 로그인·토큰·공개키 주소를 알아낸다.
   *   authorization_endpoint = 프론트 로그인 URL(auth.externalUrl + /login, 호스트가 issuer 와 다름)
   *   token_endpoint·jwks_uri = issuer 기준으로 조립
   * 우리 흐름은 authorization_code + PKCE(S256) 만 지원한다(id_token/scope 없음, 공개 클라이언트).
   */
  discovery(): Record<string, unknown> {
    const issuer = this.config.issuer;
    const algs = [...new Set([...this.keys.values()].map((k) => k.alg))];
    return {
      ...(issuer ? { issuer } : {}),
      ...(this.config.authorizeUrl
        ? { authorization_endpoint: this.config.authorizeUrl }
        : {}),
      ...(issuer
        ? {
            token_endpoint: `${issuer}/oauth/token`,
            jwks_uri: `${issuer}/.well-known/jwks.json`,
          }
        : {}),
      grant_types_supported: ['authorization_code', 'refresh_token'],
      response_types_supported: ['code'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      id_token_signing_alg_values_supported: algs,
      subject_types_supported: ['public'],
    };
  }

  // ---- 로딩 ----

  /** 키 디렉터리를 읽어 맵을 채우고 **활성 키 개수**를 반환한다. 디렉터리·키가 없어도 던지지 않는다(0 반환). */
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
      this.logger.warn(
        `Multiple active keys found; signing with ${this.activeKid}.`,
      );
    }
    this.logger.log(
      `Loaded ${this.keys.size} access-token key(s); active=${this.activeKid}.`,
    );
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
        const key = this.buildKey(
          readFileSync(join(dir, file), 'utf8'),
          parsed.alg,
          isPrivate,
        );
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
          this.logger.log(
            `${file}: kid=${key.kid} (파일명 ${parsed.kid} 은 라벨로만 쓴다)`,
          );
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
  private parseName(
    file: string,
    ext: string,
  ): { kid: string; alg: AccessAlg } | null {
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
      this.logger.warn(
        `Key ${kid}: filename alg=${alg} but curve implies ${implied}.`,
      );
    }
    // 검증용 SPKI PEM 을 공개 JWK 에서 되만든다. 입력 타입은 @types/node 버전마다 이름이 달라
    // (JsonWebKeyInput 등), 버전 무관하게 캐스팅한다.
    const publicPem = createPublicKey({
      key: publicJwk,
      format: 'jwk',
    } as unknown as Parameters<typeof createPublicKey>[0]).export({
      type: 'spki',
      format: 'pem',
    }) as string;
    return {
      kid,
      alg,
      publicPem,
      privatePem: isPrivate ? pem : undefined,
      jwk: { ...publicJwk, kid, alg, use: 'sig' },
    };
  }
}
