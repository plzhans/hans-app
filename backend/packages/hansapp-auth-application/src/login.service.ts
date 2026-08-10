import { Injectable } from '@nestjs/common';
import {
  AuthLogResult,
  AuthProvider,
  User,
  AuthLogAction,
} from '@hansapp/data';
import { DomainEvent } from '@hansapp/event-contract';
import { EventPublisher } from '@hansapp/event-publisher';

import { AuthLogService } from './log/auth-log.service';
import { AuthTokens, TokenService } from './token/token.service';
import type { RequestMeta } from './auth.service';

/**
 * **로그인이 끝나는 자리.** 어느 경로로 들어왔든 여기를 지난다.
 *
 * 세션 발급과 감사 로그는 항상 짝이다. 그런데 로그인 성립 지점이 여럿이라(이메일·소셜 가입·
 * 인가코드 교환·소셜 쿠키 직행) 같은 두 줄이 곳곳에 복사돼 있었고, 한 곳만 고치면 조용히
 * 어긋났다. 나중에 "로그인 알림", "새 기기 감지" 같은 것을 붙일 자리도 흩어진다.
 *
 * **`provider` 는 이번 로그인에 실제로 쓴 수단이다.** 가입 방식(`user.joinType`)이 아니다 —
 * 이메일로 가입한 사람이 구글을 연동해 로그인할 수 있고, 그때 남아야 할 값은 GOOGLE 이다.
 * 인가코드 교환 경로가 joinType 을 적고 있어서 그 구분이 로그에서 사라져 있었다.
 */
@Injectable()
export class LoginService {
  constructor(
    private readonly events: EventPublisher,
    private readonly tokens: TokenService,
    private readonly log: AuthLogService,
  ) {}

  /**
   * 세션을 발급하고 로그인 성공을 기록한다.
   *
   * @param provider 이번 로그인에 쓴 수단(EMAIL·GOOGLE·NAVER·KAKAO·LINE)
   */
  async complete(
    user: Pick<User, 'id' | 'role'>,
    provider: AuthProvider,
    meta: RequestMeta,
    /** "로그인 상태 유지". 기본은 유지 — 소셜·가입 등 선택을 받을 자리가 없는 경로가 그대로 쓴다. */
    persistent = true,
  ): Promise<AuthTokens> {
    const tokens = await this.tokens.issueLogin(
      user.id,
      user.role,
      meta,
      persistent,
    );
    await this.log.record({
      userId: user.id,
      action: AuthLogAction.LOGIN,
      result: AuthLogResult.SUCCESS,
      provider,
      ...meta,
    });

    /*
      **로그인이 성립했다는 사실만 알린다.** 뒤이어 무엇을 할지(세션 정리·알림 등)는 받는
      쪽이 정한다 — 여기에 후속 처리를 직접 적으면 하나 늘 때마다 로그인 경로가 길어지고,
      그만큼 사용자가 기다린다. 발행은 기다리지 않는다(EventPublisher 주석 참고).
    */
    this.events.publish(DomainEvent.AuthLogin, {
      userId: user.id,
      sessionId: tokens.sessionId,
    });

    return tokens;
  }
}
