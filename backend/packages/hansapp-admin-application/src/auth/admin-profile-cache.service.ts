import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

import { inspectCacheEntry } from '../user/cache-inspector';
import type { CacheEntryState } from '../user/cache-inspector';
import { ADMIN_AUTH_CONFIG } from './admin-auth.config';
import type { AdminAuthConfig } from './admin-auth.config';
import { adminProfileKey } from './admin-cache-keys';

/** 내 정보 캐시의 상태. 모양은 세션 캐시·회원 캐시와 같다(CacheEntryState). */
export type AdminProfileCacheState = CacheEntryState;

/**
 * `GET /api/admins/me` 응답 캐시.
 *
 * **세션 캐시와 성격이 다르다.** 그쪽은 가드가 요청마다 보는 판단(살아 있나)이고, 이쪽은
 * 화면에 뿌리는 값(이름·등급·언어·마지막 로그인)이다 — 틀리면 막히는 것이 아니라 **옛 값이
 * 보인다.** 그래서 TTL 은 "코드가 무효화를 빠뜨렸을 때 얼마나 빨리 낫나" 이고, 정상 경로는
 * 값이 바뀌는 자리마다 이 캐시를 직접 지운다.
 *
 * **지우는 자리를 한 곳에 적어 둔다**(빠뜨리면 옛 값이 TTL 만큼 남는다):
 *   - 로그인 — 마지막 로그인 시각이 바뀐다(AdminLoginService)
 *   - 본인 비밀번호 변경·초기화 — 변경 강제 플래그가 바뀐다(AdminAuthService)
 *   - 계정 비활성/활성 — 상태가 바뀐다(AdminAuthService)
 *   - 콘솔의 계정 수정·삭제 — 이메일·이름·등급·언어·시간대(AdminAccountService)
 *
 * **회원 쪽(UserProfileCacheAdmin)과 달리 이벤트를 올리지 않는다.** 그쪽은 캐시를 소유한
 * 프로세스가 따로(hansapp-api) 있고 그 앞에 메모리 단이 한 겹 더 있어서 알릴 상대가 있지만,
 * 이 캐시는 관리자 API 가 직접 읽고 쓰는 한 단짜리다.
 */
@Injectable()
export class AdminProfileCache {
  private readonly logger = new Logger(AdminProfileCache.name);

  constructor(
    @Inject(ADMIN_AUTH_CONFIG) private readonly config: AdminAuthConfig,
    @Optional() @Inject(CACHE_MANAGER) private readonly cache?: Cache,
  ) {}

  /**
   * 캐시에 있으면 그것을, 없으면 `load()` 로 채워서 돌려준다.
   *
   * **담는 것은 응답 그대로다.** 화면이 받을 모양으로 굳혀 두어야 캐시를 들여다볼 때
   * "지금 나가는 것" 과 눈으로 대조된다 — 반쯤 가공한 값을 담으면 그 대조가 깨진다.
   */
  async read<T>(adminId: number, load: () => Promise<T | null>): Promise<T | null> {
    const key = adminProfileKey(adminId);
    try {
      // 한 겹 감싸서 넣는다 — 꺼낼 때 "캐시에 없다" 와 "조회했는데 없더라" 가 갈린다.
      const cached = await this.cache?.get<{ v: T | null }>(key);
      if (cached) return cached.v;
    } catch (error) {
      // 캐시가 흔들려도 조회를 실패로 만들지 않는다. 원천(DB)이 답을 갖고 있다.
      this.logger.warn(`Failed to read admin profile cache (adminId=${adminId}): ${String(error)}`);
    }

    const value = await load();
    try {
      await this.cache?.set(key, { v: value }, this.config.profileCacheTtlSec * 1000);
    } catch (error) {
      this.logger.warn(
        `Failed to write admin profile cache (adminId=${adminId}): ${String(error)}`,
      );
    }
    return value;
  }

  /** 들여다본다. **지우기 전에 지울 것이 있는지 보라고 두는 창이다.** */
  inspect(adminId: number): Promise<AdminProfileCacheState> {
    return inspectCacheEntry(this.cache, adminProfileKey(adminId), (error) =>
      this.logger.warn(`Failed to read admin profile cache (adminId=${adminId}): ${String(error)}`),
    );
  }

  /**
   * 지운다. **실패해도 던지지 않는다** — 값이 바뀌는 경로에서 부르는 것이라, 여기서
   * 예외를 내면 정작 성공한 일(수정·로그인)이 실패로 보인다. 남은 캐시는 TTL 로 낫는다.
   */
  async purge(adminId: number): Promise<void> {
    try {
      await this.cache?.del(adminProfileKey(adminId));
    } catch (error) {
      this.logger.warn(
        `Failed to evict admin profile cache (adminId=${adminId}): ${String(error)}`,
      );
    }
  }
}
