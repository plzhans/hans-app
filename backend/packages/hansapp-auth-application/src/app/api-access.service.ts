import { Injectable, Logger } from '@nestjs/common';
import { AuthErrorCode, ServiceKeyInvalidError } from '../error';
import { AppClientType, AppStatus } from '@hansapp/data';
import type { Request } from 'express';

import { UnauthorizedError, sha256hex, timingSafeEqualHex } from '@hansapp/common';
import { AccessCache } from './access-cache.service';

/** API 접근 주체. 가드가 request.apiAccess 에 채운다. */
export interface ApiAccess {
  appId: number;
  /**
   * 앱을 알아낸 경로.
   *   service  서비스 키(sk_)
   *   client   X-Client-Id 헤더
   *   token    사용자 access token 의 `app` 클레임 — 헤더보다 이쪽이 우선이다(AuthGuard 참고)
   */
  via: 'service' | 'client' | 'token';
  /** via='service' */
  keyId?: number;
  /** via='client' */
  clientId?: string;
  clientType?: AppClientType;
}

/**
 * 외부 앱의 API 접근 인증. 두 경로를 지원한다.
 * - **서비스 키**: `Authorization: Bearer sk_{appId}_{keyId}_{rand}`. 서버-서버용, 오리진은 보지 않는다.
 * - **클라이언트**: `X-Client-Id: <clientId>`(서비스 키 없이). WEB 타입이면 요청 Origin 을 등록 오리진과 대조한다.
 *
 * 키/클라이언트의 **status(ACTIVE)만** 확인한다(앱 상태는 이 단계에서 보지 않는다).
 * 조회는 AccessCache(1일)로 캐싱해 DB 부하를 막는다.
 */
@Injectable()
export class ApiAccessService {
  private readonly logger = new Logger(ApiAccessService.name);

  constructor(private readonly cache: AccessCache) {}

  /** 요청에 서비스 키(sk_ 베어러) 또는 X-Client-Id 가 있는지(= API 접근을 시도하는지). */
  hasCredentials(req: Request): boolean {
    const bearer = extractBearer(req);
    return (bearer?.startsWith('sk_') ?? false) || !!clientIdHeader(req);
  }

  /** API 접근을 인증한다. 실패 시 401. */
  async authenticate(req: Request): Promise<ApiAccess> {
    const bearer = extractBearer(req);
    if (bearer?.startsWith('sk_')) {
      return this.viaServiceKey(bearer);
    }
    const clientId = clientIdHeader(req);
    if (clientId) {
      return this.viaClient(clientId, req);
    }
    throw new UnauthorizedError(AuthErrorCode.APP_CREDENTIALS_REQUIRED);
  }

  /** 서비스 키 검증: 파싱 → 캐시 조회 → status·해시 확인. 오리진은 무시. */
  private async viaServiceKey(token: string): Promise<ApiAccess> {
    const parsed = parseServiceKey(token);
    if (!parsed) {
      throw new ServiceKeyInvalidError({ message: 'Malformed service key.' });
    }
    const key = await this.cache.getApiKey(parsed.appId, parsed.keyId);
    // 존재 여부·해시는 상태와 무관하게 먼저 본다. PENDING 안내를 해시 검증보다 앞에 두면
    // 아무 키나 넣어보고 appId/keyId 가 실재하는지 떠볼 수 있다(enumeration).
    if (!key || !timingSafeEqualHex(key.keyHash, sha256hex(token))) {
      throw new ServiceKeyInvalidError();
    }
    // 진짜 키임이 확인된 뒤에만 미승인 사유를 알려 준다.
    if (key.status === AppStatus.PENDING) {
      throw new UnauthorizedError(AuthErrorCode.APP_PENDING_APPROVAL);
    }
    if (key.status !== AppStatus.ACTIVE) {
      throw new ServiceKeyInvalidError();
    }
    return { appId: key.appId, via: 'service', keyId: key.id };
  }

  /** 클라이언트 검증: 캐시 조회 → status 확인 → WEB 이면 오리진 대조. */
  private async viaClient(clientId: string, req: Request): Promise<ApiAccess> {
    const client = await this.cache.getClient(clientId);
    if (!client) {
      throw new UnauthorizedError(AuthErrorCode.APP_CLIENT_INVALID);
    }
    // clientId 는 추측 불가한 40자라, 그걸 아는 것 자체가 존재를 아는 것이다 —
    // PENDING 사유를 알려도 새로 새는 정보가 없다(서비스 키와 상황이 다르다).
    if (client.status === AppStatus.PENDING) {
      throw new UnauthorizedError(AuthErrorCode.APP_PENDING_APPROVAL);
    }
    if (client.status !== AppStatus.ACTIVE) {
      throw new UnauthorizedError(AuthErrorCode.APP_CLIENT_INVALID);
    }
    if (client.type === AppClientType.WEB) {
      const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
      const origins = (client.origins as string[] | null) ?? [];
      if (!origin || !origins.includes(origin)) {
        this.logger.debug(
          `Client rejected: origin not registered (clientId=${clientId} origin=${origin ?? '-'})`,
        );
        throw new UnauthorizedError(AuthErrorCode.APP_ORIGIN_NOT_ALLOWED);
      }
    }
    return {
      appId: client.appId,
      via: 'client',
      clientId: client.clientId,
      clientType: client.type,
    };
  }
}

/** Authorization: Bearer <token> 에서 토큰만 뽑는다. 스킴은 대소문자 무관(RFC 7235). */
function extractBearer(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (!header) return undefined;
  const [scheme, value] = header.trim().split(/\s+/);
  return scheme?.toLowerCase() === 'bearer' && value ? value : undefined;
}

/** X-Client-Id 헤더 값. */
function clientIdHeader(req: Request): string | undefined {
  const v = req.headers['x-client-id'];
  const raw = Array.isArray(v) ? v[0] : v;
  return raw && raw.trim() ? raw.trim() : undefined;
}

/**
 * 서비스 키 파싱: `sk_{appId}_{keyId}_{rand}`.
 * rand(base64url)는 '_' 를 포함할 수 있으나 appId·keyId 는 숫자라 앞 3토막만 보면 된다.
 */
function parseServiceKey(token: string): { appId: number; keyId: number } | null {
  const parts = token.split('_');
  if (parts.length < 4 || parts[0] !== 'sk') return null;
  const appId = Number(parts[1]);
  const keyId = Number(parts[2]);
  if (!Number.isInteger(appId) || !Number.isInteger(keyId)) return null;
  return { appId, keyId };
}
