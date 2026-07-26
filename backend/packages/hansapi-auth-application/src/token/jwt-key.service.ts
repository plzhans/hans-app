import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, createPrivateKey, createPublicKey } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { AUTH_CONFIG } from '../auth.config';
import type { AuthConfig } from '../auth.config';

/** 허용하는 JWT alg(RFC 7518). 파일명 접미사(`<kid>_<alg>`) 검증에 쓴다. 지금은 EC 계열만. */
type AccessAlg = 'ES256' | 'ES384' | 'ES512';
const KNOWN_ALGS = new Set<AccessAlg>(['ES256', 'ES384', 'ES512']);

/** kid = JWK thumbprint(RFC 7638) 앞 16자. 파일명·JWT 헤더·JWKS 에 쓰는 짧은 식별자. */
const KID_LEN = 16;

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
    this.asymmetric = Boolean(config.jwtKeyDir);
    if (config.jwtKeyDir) {
      this.loadKeys(config.jwtKeyDir);
    } else {
      this.logger.warn(
        'AUTH_JWT_KEY_DIR unset — access tokens signed with HS256 (symmetric fallback).',
      );
    }
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

  /** OIDC discovery 문서(부분). issuer 미설정이면 jwks_uri 는 생략된다. */
  discovery(): Record<string, unknown> {
    const algs = [...new Set([...this.keys.values()].map((k) => k.alg))];
    return {
      issuer: this.config.issuer,
      ...(this.config.issuer
        ? { jwks_uri: `${this.config.issuer}/.well-known/jwks.json` }
        : {}),
      id_token_signing_alg_values_supported: algs,
      response_types_supported: ['code'],
      subject_types_supported: ['public'],
    };
  }

  // ---- 로딩 ----

  private loadKeys(dir: string): void {
    const actives = this.loadDir(dir, '.key', true);
    const retiredDir = join(dir, 'retired');
    if (existsSync(retiredDir)) {
      this.loadDir(retiredDir, '.pub', false);
    }
    if (actives.length === 0) {
      throw new Error(`No active signing key (*.key) found in ${dir}`);
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
        // 파일명 신뢰 안 함 — 내용에서 계산한 kid 와 어긋나면 스킵(손 rename 사고 차단).
        if (key.kid !== parsed.kid) {
          this.logger.warn(
            `Skip ${file}: filename kid≠thumbprint (${parsed.kid}≠${key.kid}).`,
          );
          continue;
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
    // 공개 JWK 를 뽑는다. 개인키 export('jwk')엔 d(개인 스칼라)가 들어가므로 떼어낸다.
    // (KeyObject 를 createPublicKey 에 직접 넘기면 @types/node 버전에 따라 타입이 안 맞아,
    //  JWK 를 경유해 이식성 있게 처리한다.)
    let publicJwk: Record<string, string>;
    if (isPrivate) {
      publicJwk = createPrivateKey(pem).export({ format: 'jwk' }) as Record<
        string,
        string
      >;
      delete publicJwk.d; // 개인 스칼라 제거 → 공개 JWK
    } else {
      publicJwk = createPublicKey(pem).export({ format: 'jwk' }) as Record<
        string,
        string
      >;
    }
    const kid = this.thumbprint(publicJwk);
    const implied = this.algForCurve(publicJwk.crv);
    if (implied && implied !== alg) {
      this.logger.warn(
        `Key ${kid}: filename alg=${alg} but curve implies ${implied}.`,
      );
    }
    // 입력 타입은 @types/node 버전마다 이름이 달라(JsonWebKeyInput 등), 버전 무관하게 캐스팅한다.
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

  /** RFC 7638 JWK thumbprint 의 앞 KID_LEN 자. EC 는 {crv,kty,x,y}, RSA 는 {e,kty,n} 정렬. */
  private thumbprint(jwk: Record<string, string>): string {
    const canonical =
      jwk.kty === 'EC'
        ? JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y })
        : JSON.stringify({ e: jwk.e, kty: jwk.kty, n: jwk.n });
    return createHash('sha256')
      .update(canonical)
      .digest('base64url')
      .slice(0, KID_LEN);
  }

  private algForCurve(crv?: string): AccessAlg | null {
    if (crv === 'P-256') return 'ES256';
    if (crv === 'P-384') return 'ES384';
    if (crv === 'P-521') return 'ES512';
    return null;
  }
}
