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
  EmailVerifyPurpose,
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
import { EmailVerificationService } from '../mail/email-verification.service';
import { SocialTicketService } from './social-ticket.service';
import { SocialProfile } from './social.types';

/** 콜백 처리 결과. 컨트롤러가 프론트 리다이렉트 URL 로 변환한다. */
export type CallbackOutcome =
  | { kind: 'code'; code: string } // 기존 계정 로그인/자동연동 → 릴레이 인가코드
  // 신규 → 가입 티켓. emailRequired: provider 가 이메일을 안 줘 입력이 필요.
  // codeRequired: provider 가 이메일을 검증하지 않아 우리 코드 인증이 필요(구글만 false).
  // email: provider 가 준 이메일(프리필용). 없으면(카카오 등) 사용자가 입력한다.
  | {
      kind: 'pending';
      ticket: string;
      emailRequired: boolean;
      codeRequired: boolean;
      email?: string;
    }
  | { kind: 'linked' } // 연동 완료
  | { kind: 'error'; error: string };

/** handleCallback 결과: 판정(outcome) + 복귀 URL(returnTo, 가드에서 허용목록 검증됨). */
export interface CallbackResult {
  outcome: CallbackOutcome;
  returnTo?: string;
  /** 클라이언트가 보낸 state. 최종 리다이렉트에 그대로 실어 돌려준다(우리는 해석하지 않는다). */
  clientState?: string;
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
    private readonly emailVerification: EmailVerificationService,
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
    return {
      outcome,
      returnTo: state.returnTo,
      clientState: state.clientState,
    };
  }

  private async resolveOutcome(
    state: {
      intent: 'login' | 'link';
      userId?: number;
      clientId?: string;
      codeChallenge?: string;
    },
    profile: SocialProfile,
    existing: { userId: number } | null,
    meta: RequestMeta,
  ): Promise<CallbackOutcome> {
    if (state.intent === 'link') {
      return this.handleLink(state.userId, profile, existing, meta);
    }

    // 로그인 의도
    if (existing) {
      // state 의 clientId 를 코드에 박는다. 이 값은 진입 시 가드가 정했고 서명으로 보호된다 —
      // 그래야 토큰 교환 때 "이 코드는 medifinder 것" 을 서버가 알 수 있다.
      const code = await this.tokens.issueAuthCode(
        existing.userId,
        state.clientId ?? null,
        state.codeChallenge ?? null,
      );
      return { kind: 'code', code };
    }

    // 미연동 → 이메일 충돌 검사 후 자동연동/신규가입
    const email = profile.email ? normalizeEmail(profile.email) : null;
    if (email) {
      const active = await this.users.findActiveByEmail(email);
      if (active) {
        // 자동 연동: **양쪽 이메일이 모두 검증된 경우에만** 안전하다(계정 탈취 방지).
        // provider 가 검증한 이메일(구글 등)이 이미 검증된 계정과 같으면 = 같은 사람이므로
        // 그 계정에 이 소셜을 연동하고 로그인시킨다.
        if (profile.emailVerified && active.emailVerified) {
          await this.oauths.create({
            userId: active.id,
            provider: profile.provider,
            providerId: profile.providerId,
            email: profile.email,
          });
          await this.log.record({
            userId: active.id,
            action: UserAction.OAUTH_LINK,
            result: ActionResult.SUCCESS,
            provider: toJoinType(profile.provider),
            ...meta,
          });
          const code = await this.tokens.issueAuthCode(
            active.id,
            state.clientId ?? null,
            state.codeChallenge ?? null,
          );
          return { kind: 'code', code };
        }
        // 한쪽이라도 미검증이면 자동연동 금지 — 소유가 증명되지 않아 탈취 위험이 있다.
        // (기존 계정에 연동하려면 그 계정으로 로그인해 직접 연동해야 한다.)
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
    // 구글처럼 provider 가 이메일을 검증한 경우만 코드 인증을 건너뛴다.
    return {
      kind: 'pending',
      ticket,
      emailRequired: !email,
      codeRequired: !profile.emailVerified,
      email: email ?? undefined,
    };
  }

  /**
   * 소셜 가입 코드 발송. 티켓의 이메일(네이버·라인 등) 또는 사용자가 입력한 이메일(카카오 등)로
   * 인증 코드를 보낸다. provider 가 이미 검증한 이메일이면 코드가 필요 없다(호출하지 않는다).
   */
  async requestRegisterCode(
    ticket: string,
    emailInput?: string | null,
    locale?: string,
  ): Promise<void> {
    const payload = this.tickets.verifyRegister(ticket);
    const email = normalizeEmail(payload.email ?? emailInput ?? '');
    if (!email) {
      throw new BadRequestException('Email is required.');
    }
    await this.authService.assertEmailAvailable(email);
    await this.emailVerification.issueAndSend(
      EmailVerifyPurpose.SIGNUP,
      email,
      {
        locale,
      },
    );
  }

  /**
   * 소셜 pending 가입 확정. 이메일이 없던 경우 프론트가 입력받아 body 로 넘긴다.
   *
   * **검증된 이메일만 계정을 소유한다.** provider 가 검증한 이메일(구글)이면 코드가 필요 없고,
   * 그 외(네이버·라인·카카오 미검증, 사용자 직접 입력)는 우리 코드 인증을 통과해야 한다 —
   * 통과 못 하면 계정을 만들지 않는다(미검증 계정·스쿼팅 방지). 성공하면 emailVerified=true 로 만든다.
   */
  async register(
    input: { ticket: string; email?: string | null; code?: string | null },
    meta: RequestMeta,
  ): Promise<AuthResult> {
    const payload = this.tickets.verifyRegister(input.ticket);

    // 이미 연동됐다면(콜백 후 지연 등) 중복 가입을 막는다.
    const dup = await this.oauths.findByProvider(
      payload.provider,
      payload.providerId,
    );
    if (dup) {
      throw new ConflictException('Social account already linked.');
    }

    const email = normalizeEmail(payload.email ?? input.email ?? '');
    if (!email) {
      throw new BadRequestException('Email is required.');
    }
    await this.authService.assertEmailAvailable(email);

    // provider 가 준 검증 이메일을 그대로 쓸 때만 provider 검증으로 인정한다(사용자 입력은 미검증).
    const providerVerified =
      !!payload.email &&
      normalizeEmail(payload.email) === email &&
      payload.emailVerified;

    // provider 가 검증하지 않았으면 우리 코드로 소유를 증명해야 한다.
    if (!providerVerified) {
      if (!input.code) {
        throw new BadRequestException('Verification code is required.');
      }
      const ok = await this.emailVerification.verify(
        EmailVerifyPurpose.SIGNUP,
        email,
        input.code,
      );
      if (!ok) {
        throw new BadRequestException('Invalid or expired verification code.');
      }
    }

    const user = await this.users.create({
      email,
      emailVerified: true,
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
      throw new BadRequestException('Provider is not linked.');
    }
    // 비밀번호도 없고 이 연동이 유일한 로그인 수단이면 해제 불가.
    if (!user.password && links.length <= 1) {
      throw new BadRequestException(
        'Cannot unlink the last sign-in method. Set a password first.',
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
