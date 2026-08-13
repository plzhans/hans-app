import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import { UserAdminRepository } from './user-admin.repository';
import { UserProfileCacheAdmin } from './user-profile-cache.admin';

/** 관리자가 고칠 수 있는 것. 준 항목만 바뀐다. */
export interface UserAdminUpdate {
  /** 표시 이름. 빈 문자열이면 지운다(null). */
  readonly name?: string;
}

/**
 * 관리자에 의한 회원 정보 수정.
 *
 * **고칠 수 있는 것은 표시 이름뿐이다.** 나머지는 열지 않았다 —
 *
 *  - 이메일은 로그인 식별자다. 남이 바꾸면 그 계정의 주인이 바뀐다.
 *  - 이메일 인증 여부는 "우리가 확인했다" 는 사실의 기록이라, 손으로 켜면 그 기록이 거짓이 된다.
 *  - 언어·시간대는 본인의 표시 취향이라 남이 정할 값이 아니다.
 *  - 등급(tier)은 앱 생성 한도를 바꾼다 — 과금과 얽히므로 따로 설계할 일이다.
 *
 * 지금 열 이유가 있는 것만 열고, 필요해지면 그때 무엇을 어디까지 허용할지 정한다.
 *
 * **고친 뒤 캐시를 비운다.** `/users/me` 응답이 이 이름을 담고 있어서, 안 비우면 회원이
 * 보는 자기 이름이 한동안 옛것으로 남는다.
 *
 * 비우는 방법이 두 갈래인 것에 이유가 있다. 공유 캐시(Redis)는 **여기서 직접 지운다** —
 * 이벤트에 맡기면 큐가 죽었을 때 Redis TTL(10분)만큼 옛 값이 그대로 남는다. 각 인스턴스의
 * 메모리는 밖에서 손댈 수 없으니 이벤트로 알린다. 둘 다 UserProfileCacheAdmin 이 한다.
 */
@Injectable()
export class UserAdminService {
  private readonly logger = new Logger(UserAdminService.name);

  constructor(
    private readonly repo: UserAdminRepository,
    private readonly cache: UserProfileCacheAdmin,
  ) {}

  async update(userId: number, input: UserAdminUpdate): Promise<void> {
    const data: { name?: string | null } = {};
    if (input.name !== undefined) {
      const trimmed = input.name.trim();
      // 빈 문자열과 "없음" 을 DB 에서 가르지 않는다(회원 본인 통로와 같은 규칙).
      data.name = trimmed || null;
    }

    // 보낸 항목이 하나도 없다. 조회도 이벤트도 필요 없다.
    if (Object.keys(data).length === 0) return;

    const updated = await this.repo.updateProfile(userId, data);
    if (updated === 0) {
      throw new NotFoundException(`User not found: ${userId}`);
    }

    await this.cache.purge(userId);
    this.logger.log(`회원 정보 수정: userId=${userId}`);
  }
}
