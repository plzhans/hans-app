import { Injectable } from '@nestjs/common';
import type { AdminUser } from '@hansapp/data';

import { AdminActionLogService } from './admin-action-log.service';
import { AdminTokenService } from './admin-token.service';
import type { AdminAuthTokens, AdminRequestMeta } from './admin-token.service';
import { AdminUserRepository } from './admin-user.repository';

/**
 * 로그인이 성립한 뒤를 담당한다.
 *
 * **세션 발급·마지막 로그인 기록·감사 로그는 항상 짝이다.** 지금은 로그인 경로가 하나뿐이지만
 * (이메일/비밀번호), 나중에 하나가 늘 때 이 세 줄이 복사되면 어느 쪽이 먼저 어긋난다.
 * 그 자리를 미리 하나로 못박아 둔다.
 */
@Injectable()
export class AdminLoginService {
  constructor(
    private readonly tokens: AdminTokenService,
    private readonly admins: AdminUserRepository,
    private readonly log: AdminActionLogService,
  ) {}

  /**
   * @param detail 무엇으로 들어왔는지 같은 부가정보. **로그인 종류를 action 으로 늘리지 않고
   *   여기 남긴다** — "언제 로그인했나" 를 묻는 조회가 값 하나만 알면 되게 하려는 것이다.
   */
  async complete(
    admin: Pick<AdminUser, 'id' | 'email' | 'mustChangePassword'>,
    meta: AdminRequestMeta,
    detail?: Record<string, string | number | boolean | null>,
  ): Promise<AdminAuthTokens> {
    const session = await this.tokens.createSession(admin.id, meta);
    // 강제 변경 여부가 access token 클레임으로 실린다 — 가드가 이 값으로 업무 API 를 막는다.
    const tokens = this.tokens.buildTokens(admin.id, session, admin.mustChangePassword);

    await this.admins.touchLastLogin(admin.id, new Date());
    // 상한을 넘은 오래된 세션 정리. 방금 만든 세션이 가장 최근이라 살아남는다.
    await this.tokens.trimSessions(admin.id);

    await this.log.record({
      adminId: admin.id,
      email: admin.email,
      action: 'LOGIN',
      result: 'SUCCESS',
      sessionId: tokens.sessionId,
      ip: meta.ip,
      userAgent: meta.userAgent,
      detail: detail ?? null,
    });

    return tokens;
  }
}
