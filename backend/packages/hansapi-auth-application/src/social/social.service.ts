import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ActionResult,
  AuthProvider,
  OAuthProvider,
  UserAction,
  UserStatus,
} from '@hansapi/data';

import { AUTH_CONFIG } from '../auth.config';
import type { AuthConfig } from '../auth.config';
import { AuthResult, AuthService, RequestMeta } from '../auth.service';
import { ActionLogService } from '../log/action-log.service';
import { UserRepository } from '../repository/user.repository';
import { UserOAuthRepository } from '../repository/user-oauth.repository';
import { WithdrawalRepository } from '../repository/withdrawal.repository';
import { TokenService } from '../token/token.service';
import { SocialTicketService } from './social-ticket.service';
import { SocialProfile } from './social.types';

/** 콜백 처리 결과. 컨트롤러가 프론트 리다이렉트 URL 로 변환한다. */
export type CallbackOutcome =
  | { kind: 'code'; code: string } // 기존 계정 로그인 → 릴레이 인가코드
  | { kind: 'pending'; ticket: string; emailRequired: boolean } // 신규 → 가입 티켓
  | { kind: 'linked' } // 연동 완료
  | { kind: 'error'; error: string };

/** handleCallback 결과: 판정(outcome) + 복귀 URL(returnTo, 가드에서 허용목록 검증됨). */
export interface CallbackResult {
  outcome: CallbackOutcome;
  returnTo?: string;
}

/** OAuthProvider → 가입수단(AuthProvider). 키 이름이 같아 그대로 매핑된다. */
function toJoinType(provider: OAuthProvider): AuthProvider {
  return AuthProvider[provider as keyof typeof AuthProvider];
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * 소셜 로그인 오케스트레이션. 전략이 정규화한 SocialProfile 을 받아
 * 로그인/신규가입(pending)/연동을 판정하고, pending 최종 가입·연동·연동해제를 수행한다.
 */
@Injectable()
export class SocialService {
  constructor(
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    private readonly users: UserRepository,
    private readonly oauths: UserOAuthRepository,
    private readonly withdrawals: WithdrawalRepository,
    private readonly authService: AuthService,
    private readonly tokens: TokenService,
    private readonly tickets: SocialTicketService,
    private readonly log: ActionLogService,
  ) {}

  /** provider 콜백 처리. state 의도에 따라 분기하고, 복귀 URL(returnTo)을 함께 돌려준다. */
  async handleCallback(
    profile: SocialProfile,
    stateToken: string,
    meta: RequestMeta,
  ): Promise<CallbackResult> {
    const state = this.tickets.verifyState(stateToken);
    const existing = await this.oauths.findByProvider(
      profile.provider,
      profile.providerId,
    );
    const outcome = await this.resolveOutcome(state, profile, existing, meta);
    return { outcome, returnTo: state.returnTo };
  }

  private async resolveOutcome(
    state: { intent: 'login' | 'link'; userId?: number },
    profile: SocialProfile,
    existing: { userId: number } | null,
    meta: RequestMeta,
  ): Promise<CallbackOutcome> {
    if (state.intent === 'link') {
      return this.handleLink(state.userId, profile, existing, meta);
    }

    // 로그인 의도
    if (existing) {
      const code = await this.tokens.issueAuthCode(existing.userId);
      return { kind: 'code', code };
    }

    // 미연동 → 신규 가입 흐름
    const email = profile.email ? normalizeEmail(profile.email) : null;
    if (email) {
      const active = await this.users.findActiveByEmail(email);
      if (active) {
        return { kind: 'error', error: 'email_exists' };
      }
      const withdrawn = await this.withdrawals.findActiveByEmail(
        email,
        new Date(),
      );
      if (withdrawn) {
        return { kind: 'error', error: 'withdrawn_cooldown' };
      }
    }
    const ticket = this.tickets.signRegister({
      provider: profile.provider,
      providerId: profile.providerId,
      email,
      name: profile.name,
      emailVerified: profile.emailVerified,
    });
    return { kind: 'pending', ticket, emailRequired: !email };
  }

  /**
   * 소셜 pending 가입 확정. 이메일이 없던 경우 프론트가 입력받아 body 로 넘긴다.
   * 일반 계정을 만들고 소셜 연동을 매핑한다.
   */
  async register(
    input: { ticket: string; email?: string | null },
    meta: RequestMeta,
  ): Promise<AuthResult> {
    const payload = this.tickets.verifyRegister(input.ticket);

    // 이미 연동됐다면(콜백 후 지연 등) 중복 가입을 막는다.
    const dup = await this.oauths.findByProvider(
      payload.provider,
      payload.providerId,
    );
    if (dup) {
      throw new ConflictException('이미 가입된 소셜 계정입니다.');
    }

    const email = normalizeEmail(payload.email ?? input.email ?? '');
    if (!email) {
      throw new BadRequestException('이메일이 필요합니다.');
    }
    await this.authService.assertEmailAvailable(email);

    // provider 가 준 검증 이메일을 그대로 쓸 때만 검증됨으로 인정한다(사용자 입력은 미검증).
    const emailVerified =
      !!payload.email &&
      normalizeEmail(payload.email) === email &&
      payload.emailVerified;

    const user = await this.users.create({
      email,
      emailVerified,
      password: null,
      name: payload.name,
      joinType: toJoinType(payload.provider),
    });
    await this.oauths.create({
      userId: user.id,
      provider: payload.provider,
      providerId: payload.providerId,
      email: payload.email,
    });

    await this.log.record({
      userId: user.id,
      action: UserAction.SIGNUP,
      result: ActionResult.SUCCESS,
      provider: toJoinType(payload.provider),
      ...meta,
    });
    const tokens = await this.tokens.issueLogin(user.id, user.role, meta);
    await this.log.record({
      userId: user.id,
      action: UserAction.LOGIN,
      result: ActionResult.SUCCESS,
      provider: toJoinType(payload.provider),
      ...meta,
    });
    return { user, tokens };
  }

  /** 연동 시작 토큰 발급(로그인 상태). 프론트가 GET /auth/:provider?link_token= 로 넘긴다. */
  prepareLink(userId: number): string {
    return this.tickets.signLinkPrepare(userId);
  }

  /** 연동 해제. 마지막 로그인 수단이면 막는다(소셜 전용 계정 잠김 방지). */
  async unlink(
    userId: number,
    provider: OAuthProvider,
    meta: RequestMeta,
  ): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Invalid account.');
    }
    const links = await this.oauths.listByUser(userId);
    const target = links.find((l) => l.provider === provider);
    if (!target) {
      throw new BadRequestException('연동되지 않은 provider 입니다.');
    }
    // 비밀번호도 없고 이 연동이 유일한 로그인 수단이면 해제 불가.
    if (!user.password && links.length <= 1) {
      throw new BadRequestException(
        '마지막 로그인 수단은 해제할 수 없습니다. 먼저 비밀번호를 설정하세요.',
      );
    }
    await this.oauths.delete(userId, provider);
    await this.log.record({
      userId,
      action: UserAction.OAUTH_UNLINK,
      result: ActionResult.SUCCESS,
      provider: toJoinType(provider),
      ...meta,
    });
  }

  /** 연동 처리(내부). intent=link 경로에서 호출된다. */
  private async handleLink(
    userId: number | undefined,
    profile: SocialProfile,
    existing: { userId: number } | null,
    meta: RequestMeta,
  ): Promise<CallbackOutcome> {
    if (!userId) {
      return { kind: 'error', error: 'link_requires_login' };
    }
    const user = await this.users.findById(userId);
    if (!user || user.status !== UserStatus.ACTIVE) {
      return { kind: 'error', error: 'invalid_account' };
    }
    if (existing) {
      if (existing.userId === userId) {
        return { kind: 'linked' }; // 이미 연동됨(idempotent)
      }
      return { kind: 'error', error: 'already_linked_other' };
    }
    await this.oauths.create({
      userId,
      provider: profile.provider,
      providerId: profile.providerId,
      email: profile.email,
    });
    await this.log.record({
      userId,
      action: UserAction.OAUTH_LINK,
      result: ActionResult.SUCCESS,
      provider: toJoinType(profile.provider),
      ...meta,
    });
    return { kind: 'linked' };
  }
}
