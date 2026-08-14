import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import type { OAuthProvider, UserStatus } from '@hansapp/data';

import { PROFILE_CACHE_CONFIG } from './auth.config';
import type { ProfileCacheConfig } from './auth.config';
import { UserRepository } from './repository/user.repository';
import { UserOAuthRepository } from './repository/user-oauth.repository';
import { TwoTierCache } from './two-tier-cache';
import { profileKey } from './auth-cache-keys';

/**
 * `/users/me` 가 돌려주는 것 전부.
 *
 * **DTO 와 필드가 같아야 한다.** 이 캐시가 담는 것은 "회원 정보" 가 아니라 **그 응답**이다 —
 * 무효화해야 하는 시점도 "회원이 바뀔 때" 가 아니라 "이 안의 값이 바뀔 때" 다.
 * 필드를 하나 더 붙이면 그 값을 바꾸는 경로에도 무효화를 넣어야 한다.
 *
 * **비밀번호 해시는 없다.** 있는지 여부(`hasPassword`)만 담는다 — 해시를 담으면 그것이
 * Redis 에 앉는다. 회원 엔티티를 통째로 캐싱하지 않고 이 뷰를 따로 둔 이유가 그것이다.
 *
 * `createdAt` 이 Date 가 아니라 ISO 문자열인 것도 캐시 때문이다. Redis 를 거치면 JSON 이
 * 되어 어차피 문자열로 돌아온다 — 타입에 Date 라고 적어 두면 그 거짓말에 맞춰 코드가 깨진다.
 */
export interface MeProfile {
  readonly id: number;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly name: string | null;
  readonly role: string;
  /** 등급(BASIC·PRO·UNLIMITED). 앱 생성 한도를 정한다. */
  readonly tier: string;
  readonly joinType: string;
  readonly language: string | null;
  readonly timeZone: string | null;
  readonly hasPassword: boolean;
  /** 활성 여부 판단용. 탈퇴·정지 계정은 호출부가 401 로 막는다. */
  readonly status: UserStatus;
  /** ISO 8601. 위 주석 참고. */
  readonly createdAt: string;
  readonly linkedProviders: OAuthProvider[];
}

/**
 * 내 정보 캐시.
 *
 * **공개 API 라 호출 빈도를 우리가 정할 수 없다.** 우리 프런트는 부팅 때 한 번 부르고 그마저
 * 로컬에 캐싱하지만, 이 엔드포인트를 쓰는 것은 결국 연동한 외부 앱이다 — 요청마다 부르는
 * 클라이언트가 있어도 이상하지 않다. 그래서 응답을 통째로 캐싱한다.
 *
 * **조립을 여기서 한다.** 회원 행과 소셜 연동 두 곳에서 오는 값이라 호출부마다 조립하면
 * 무엇이 이 응답을 이루는지가 흩어진다 — 그러면 무효화할 자리도 흩어진다. 입력이 한 곳에
 * 모여 있어야 필드를 늘릴 때 빠뜨린 것이 보인다.
 *
 * **TTL 이 안전망이다.** 무효화 지점을 하나 빠뜨려도 sharedTtlSec(기본 60초) 안에 스스로
 * 낫는다. 사용자가 방금 자기 손으로 바꾼 값은 그 60초도 길기 때문에 아래 invalidate 를
 * 쓰기 경로에서 함께 부른다 — TTL 은 못 잡은 것을 위한 뒷받침이지 기본 수단이 아니다.
 */
@Injectable()
export class ProfileCache {
  private readonly cache: TwoTierCache<MeProfile>;

  constructor(
    private readonly users: UserRepository,
    private readonly oauths: UserOAuthRepository,
    @Inject(PROFILE_CACHE_CONFIG) config: ProfileCacheConfig,
    @Optional() @Inject(CACHE_MANAGER) shared?: Cache,
  ) {
    this.cache = new TwoTierCache(config, shared, new Logger(ProfileCache.name));
  }

  /** 없는 회원이면 null. 탈퇴·정지 여부는 `status` 를 보고 호출부가 정한다. */
  get(userId: number): Promise<MeProfile | null> {
    return this.cache.read(profileKey(userId), async () => {
      const user = await this.users.findById(userId);
      if (!user) return null;

      const links = await this.oauths.listByUser(userId);
      return {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        name: user.name,
        role: user.role,
        tier: user.tier,
        joinType: user.joinType,
        language: user.language,
        timeZone: user.timeZone,
        // **해시가 아니라 있는지 여부만.** 위 인터페이스 주석 참고.
        hasPassword: user.password !== null,
        status: user.status,
        createdAt: user.createdAt.toISOString(),
        linkedProviders: links.map((link) => link.provider),
      };
    });
  }

  /** 응답을 이루는 값이 바뀌었을 때 부른다. */
  invalidate(userId: number): Promise<void> {
    return this.cache.drop(profileKey(userId));
  }
}
