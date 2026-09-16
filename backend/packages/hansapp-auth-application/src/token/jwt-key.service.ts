import { Inject, Injectable } from '@nestjs/common';
import { JwtKeyStore, JwtVerifyError } from '@hansapp/jwt';

import { TokenInvalidError } from '../error';
import { AUTH_CONFIG } from '../auth.config';
import type { AuthConfig } from '../auth.config';

/**
 * 사용자 access token 의 서명·검증 키.
 *
 * **키를 다루는 일은 전부 @hansapp/jwt 가 한다.** 여기 남은 것은 이 도메인의 것 둘뿐이다 —
 * 설정(AUTH_CONFIG)을 그 패키지가 아는 모양으로 옮기는 일과, OIDC discovery 문서다.
 * 그 문서는 로그인 흐름의 엔드포인트를 조립하므로 일반 패키지가 알 수 없다.
 */
@Injectable()
export class JwtKeyService extends JwtKeyStore {
  constructor(@Inject(AUTH_CONFIG) private readonly auth: AuthConfig) {
    super({
      keyDir: auth.jwtKeyDir,
      fallbackSecret: auth.jwtSecret,
      issuer: auth.issuer,
      allowedIssuers: auth.allowedIssuers,
      tokenTtlSec: auth.accessTokenTtlSec,
      label: JwtKeyService.name,
    });
  }

  /**
   * 검증 실패를 이 계층의 에러로 바꾼다.
   *
   * **밖으로 나가는 오류 코드를 그대로 두려고 덮는다.** 패키지는 도메인 코드를 모르니
   * 자기 에러를 던지는데, 그게 그대로 올라가면 필터가 500 으로 처리한다.
   */
  override verify<T extends object = Record<string, unknown>>(token: string): T {
    try {
      return super.verify<T>(token);
    } catch (error) {
      if (error instanceof JwtVerifyError) {
        throw new TokenInvalidError({ message: error.message });
      }
      throw error;
    }
  }

  /**
   * OAuth2/OIDC discovery 문서. 소비자(medifinder 등)는 이 하나로 로그인·토큰·공개키 주소를 알아낸다.
   *   authorization_endpoint = 프론트 로그인 URL(auth.externalUrl + /login, 호스트가 issuer 와 다름)
   *   token_endpoint·jwks_uri = issuer 기준으로 조립
   * 우리 흐름은 authorization_code + PKCE(S256) 만 지원한다(id_token/scope 없음, 공개 클라이언트).
   */
  discovery(): Record<string, unknown> {
    const issuer = this.auth.issuer;
    return {
      ...(issuer ? { issuer } : {}),
      ...(this.auth.authorizeUrl ? { authorization_endpoint: this.auth.authorizeUrl } : {}),
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
      id_token_signing_alg_values_supported: this.algs(),
      subject_types_supported: ['public'],
    };
  }
}
