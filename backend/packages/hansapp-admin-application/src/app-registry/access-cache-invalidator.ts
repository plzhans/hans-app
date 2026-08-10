import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

/**
 * 인증 캐시 키. **정본은 auth 계층의 AccessCache 다**(packages/hansapp-auth-application/
 * src/app/access-cache.service.ts). 여기서 형식을 다시 적는 것은 관리자 계층이 auth 계층을
 * 의존하지 않기 위해서다 — 그쪽 키 형식이 바뀌면 이 파일도 같이 고쳐야 한다.
 *
 * 환경 네임스페이스(`develop:`)는 CacheModule 이 붙이므로 여기서는 붙이지 않는다.
 */
const apiKeyCacheKey = (appId: number, keyId: number) =>
  `auth:apikey:${appId}:${keyId}`;
const clientCacheKey = (clientId: string) => `auth:client:${clientId}`;

/**
 * 앱 심사 결과를 인증 캐시에 반영한다.
 *
 * **승인만으로는 부족하다.** 서비스 키·클라이언트 조회는 Redis 에 캐싱되는데(기본 10분),
 * 개발자가 승인 전에 키를 한 번 찔러 보면 PENDING 상태의 행이 그대로 올라앉는다. 그러면
 * 승인 뒤에도 TTL 이 끝날 때까지 인증이 계속 거부된다. 켜진 것들만 골라 캐시에서 지운다.
 *
 * **인증을 처리하는 프로세스(hansapp-api)의 메모리 캐시(기본 5분)까지는 못 지운다.** Redis 만
 * 공유하기 때문이다 — 다중 인스턴스에서 이미 있는 한계와 같고, 그만큼 늦게 반영될 수 있다.
 *
 * cache 는 전역 CacheModule 을 빌려 쓴다. REDIS_URL 이 없는 환경에서는 인메모리로 폴백돼
 * 이 삭제가 사실상 무의미해지지만, 그런 환경은 프로세스도 캐시도 분리돼 있지 않다.
 */
@Injectable()
export class AccessCacheInvalidator {
  private readonly logger = new Logger(AccessCacheInvalidator.name);

  constructor(
    @Optional() @Inject(CACHE_MANAGER) private readonly cache?: Cache,
  ) {}

  /**
   * 승인으로 켜진 키·클라이언트의 캐시를 비운다.
   *
   * **실패해도 승인을 되돌리지 않는다.** DB 는 이미 바뀌었고, 캐시는 TTL 이 지나면
   * 어차피 맞춰진다 — 여기서 예외를 던지면 성공한 승인이 실패로 보인다.
   */
  async invalidate(
    appId: number,
    issued: { apiKeyIds: number[]; clientIds: string[] },
  ): Promise<void> {
    if (!this.cache) return;

    const keys = [
      ...issued.apiKeyIds.map((id) => apiKeyCacheKey(appId, id)),
      ...issued.clientIds.map(clientCacheKey),
    ];

    await Promise.all(
      keys.map((key) =>
        this.cache!.del(key).catch((error: unknown) => {
          this.logger.warn(`인증 캐시 무효화 실패: ${key} (${String(error)})`);
        }),
      ),
    );
  }
}
