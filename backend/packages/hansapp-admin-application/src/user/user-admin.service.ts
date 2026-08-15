import { Injectable, Logger } from '@nestjs/common';
import { normalizeLanguageChoice, normalizeTimeZoneChoice } from '@hansapp/common';
import {
  AdminLocaleUnsupportedError,
  AdminTimeZoneUnknownError,
  AdminUserNotFoundError,
} from '../error';
import type { UserTier } from '@hansapp/data';

import { UserAdminRepository } from './user-admin.repository';
import type { UserProfilePatch } from './user-admin.repository';
import { UserProfileCacheAdmin } from './user-profile-cache.admin';

/** 관리자가 고칠 수 있는 것. 준 항목만 바뀐다. */
export interface UserAdminUpdate {
  /** 표시 이름. 빈 문자열이면 지운다(null). */
  readonly name?: string;
  /** 등급. 앱 생성 한도를 정한다. */
  readonly tier?: UserTier;
  /** 표시·메일 언어(ko/en/ja/zh). 빈 문자열이면 지운다 — 그러면 요청 헤더를 따른다. */
  readonly language?: string;
  /** IANA 타임존 ID. 빈 문자열이면 지운다. */
  readonly timeZone?: string;
}

/**
 * 관리자에 의한 회원 정보 수정.
 *
 * **이름·등급·언어·시간대를 고친다.** 나머지는 열지 않았다 —
 *
 *  - 이메일은 로그인 식별자다. 남이 바꾸면 그 계정의 주인이 바뀐다.
 *  - 이메일 인증 여부는 "우리가 확인했다" 는 사실의 기록이라, 손으로 켜면 그 기록이 거짓이 된다.
 *
 * 언어·시간대는 본인의 표시 취향이지만, 본인이 못 들어오는 동안에는 아무도 손댈 수 없는
 * 값이 된다 — 시간대를 잘못 골라 모든 시각이 어긋나 보이는 상태가 그렇다(관리자 계정
 * 수정과 같은 이유로 열어 두었다).
 *
 * **등급은 앱 생성 한도를 바꾸는 값이다.** 문의를 받아 올려 주는 자리가 여기 말고 없어서
 * 열었다 — 과금이 붙으면 그때 이 통로부터 다시 본다.
 *
 * **고친 뒤 캐시를 비운다.** `/users/me` 응답이 이 값들을 담고 있어서, 안 비우면 회원이
 * 보는 자기 정보가 한동안 옛것으로 남는다.
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
    const data: UserProfilePatch = {};
    if (input.name !== undefined) {
      const trimmed = input.name.trim();
      // 빈 문자열과 "없음" 을 DB 에서 가르지 않는다(회원 본인 통로와 같은 규칙).
      data.name = trimmed || null;
    }
    if (input.tier !== undefined) {
      data.tier = input.tier;
    }
    /*
      **언어·시간대는 비울 수 있다.** 값이 없는 것이 정상 상태이기도 해서다 — 언어가
      비면 요청의 Accept-Language 를, 시간대가 비면 화면의 기본값을 따른다.

      비우는 것이 아니면 아는 값인지 본다. **조용히 버리지 않는다** — 목록에서 고른
      값이라 틀렸다면 화면이 잘못된 것이고, 그건 드러나야 한다(관리자 계정과 같은 규칙).
    */
    if (input.language !== undefined) {
      if (input.language.trim() === '') {
        data.language = null;
      } else {
        const language = normalizeLanguageChoice(input.language);
        if (!language) {
          throw new AdminLocaleUnsupportedError();
        }
        data.language = language;
      }
    }
    if (input.timeZone !== undefined) {
      if (input.timeZone.trim() === '') {
        data.timeZone = null;
      } else {
        const timeZone = normalizeTimeZoneChoice(input.timeZone);
        if (!timeZone) {
          throw new AdminTimeZoneUnknownError();
        }
        data.timeZone = timeZone;
      }
    }

    // 보낸 항목이 하나도 없다. 조회도 이벤트도 필요 없다.
    if (Object.keys(data).length === 0) return;

    const updated = await this.repo.updateProfile(userId, data);
    if (updated === 0) {
      throw new AdminUserNotFoundError();
    }

    await this.cache.purge(userId);
    this.logger.log(`User profile updated: userId=${userId}`);
  }
}
