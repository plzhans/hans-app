import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AuthLogResult,
  AuthProvider,
  EmailVerifyPurpose,
  OAuthProvider,
  AuthLogAction,
  UserStatus,
} from '@hansapp/data';
import { resolveUserLocale, type ClientLocaleInput } from '@hansapp/common';

import { AUTH_CONFIG } from '../auth.config';
import type { AuthConfig } from '../auth.config';
import { AuthResult, AuthService, RequestMeta } from '../auth.service';
import { AuthLogService } from '../log/auth-log.service';
import { LoginService } from '../login.service';
import { UserRepository } from '../repository/user.repository';
import { UserOAuthRepository } from '../repository/user-oauth.repository';
import { WithdrawalRepository } from '../repository/withdrawal.repository';
import { AuthTokens, TokenService } from '../token/token.service';
import { EmailVerificationService } from '../mail/email-verification.service';
import { AuthEmailService } from '../mail/auth-email.service';
import { SocialTicketService } from './social-ticket.service';
import { ConsentService, type ConsentInput } from '../consent.service';
import { SocialProfile } from './social.types';

/** 콜백 처리 결과. 컨트롤러가 프론트 리다이렉트 URL 로 변환한다. */
export type CallbackOutcome =
  // **자사(1st-party) 로그인.** 인가코드를 만들지 않는다 — 쿠키를 심을 수 있는 도메인이라
  // 코드로 우회할 이유가 없다. 코드가 없으면 훔칠 것도 없어 PKCE 도 등장하지 않는다.
  // (컨트롤러가 이 토큰으로 쿠키를 심고 returnTo 로 바로 보낸다.)
  | { kind: 'session'; tokens: AuthTokens }
  | { kind: 'code'; code: string } // 외부 앱 로그인/자동연동 → 릴레이 인가코드
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
  /**
   * 어느 클라이언트의 로그인인가. **없으면 자사(1st-party)다.**
   *
   * 착지점을 정하는 1차 기준이다 — 자사는 인증웹이 우리 것이라 returnTo 가 없어도 보낼 데가
   * 있지만, 외부는 등록된 redirect_uri 말고는 보낼 데가 없다. 진입 시 가드가 확정해 서명
   * state 에 실어 왕복시킨 값이라 위조되지 않는다.
   */
  clientId?: string;
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
    private readonly consent: ConsentService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    private readonly users: UserRepository,
    private readonly oauths: UserOAuthRepository,
    private readonly withdrawals: WithdrawalRepository,
    private readonly authService: AuthService,
    private readonly tokens: TokenService,
    private readonly tickets: SocialTicketService,
    private readonly log: AuthLogService,
    private readonly login: LoginService,
    private readonly emailVerification: EmailVerificationService,
    private readonly mail: AuthEmailService,
  ) {}

  /**
   * "소셜이 연동/해제되었다" 통지.
   *
   * **최초 가입 때는 부르지 않는다** — 그때는 가입 축하 메일이 나가고, 소셜로 가입한
   * 사람에게 "소셜이 연동되었습니다" 는 같은 사실을 두 번 말하는 것이다.
   * 알려야 하는 것은 **이미 쓰던 계정에 로그인 수단이 늘거나 줄었을 때**다.
   */
  private notifySocialChange(
    user: { email: string; name: string | null },
    kind: 'SOCIAL_LINKED' | 'SOCIAL_UNLINKED',
    provider: OAuthProvider,
    locale?: string,
  ): Promise<void> {
    return this.mail.sendAccountNotice({
      to: user.email,
      kind,
      provider,
      locale,
      userName: user.name,
    });
  }

  /** provider 콜백 처리. state 의도에 따라 분기하고, 복귀 URL(returnTo)을 함께 돌려준다. */
  async handleCallback(
    profile: SocialProfile,
    stateToken: string,
    meta: RequestMeta,
    locale?: string,
  ): Promise<CallbackResult> {
    const state = this.tickets.verifyState(stateToken);
    const existing = await this.oauths.findByProvider(
      profile.provider,
      profile.providerId,
    );
    const outcome = await this.resolveOutcome(
      state,
      profile,
      existing,
      meta,
      locale,
    );
    return {
      outcome,
      returnTo: state.returnTo,
      clientState: state.clientState,
      clientId: state.clientId,
    };
  }

  private async resolveOutcome(
    state: {
      intent: 'login' | 'link';
      userId?: number;
      clientId?: string;
      codeChallenge?: string;
      /** 시작 화면의 "로그인 상태 유지". 세 갈래(session·code·pending) 모두 이 값을 따라간다. */
      persistent?: boolean;
    },
    profile: SocialProfile,
    existing: { userId: number } | null,
    meta: RequestMeta,
    locale?: string,
  ): Promise<CallbackOutcome> {
    if (state.intent === 'link') {
      return this.handleLink(state.userId, profile, existing, meta, locale);
    }

    // 로그인 의도
    if (existing) {
      return this.completeLogin(
        existing.userId,
        state,
        toJoinType(profile.provider),
        meta,
      );
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
            action: AuthLogAction.OAUTH_LINK,
            result: AuthLogResult.SUCCESS,
            provider: toJoinType(profile.provider),
            ...meta,
          });
          /*
            **자동 연동이라 사용자가 누른 적이 없다.** 이메일이 같아서 서버가 스스로 이었다 —
            그래서 오히려 더 알려야 한다. 남이 내 이메일로 소셜을 만들어 붙였다면 이 메일이
            유일한 신호다.
          */
          await this.notifySocialChange(
            active,
            'SOCIAL_LINKED',
            profile.provider,
            locale,
          );
          return this.completeLogin(
            active.id,
            state,
            toJoinType(profile.provider),
            meta,
          );
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
      // 가입 화면에는 체크박스가 없다. 시작할 때 고른 값을 티켓에 실어 가입 직후 로그인까지 잇는다.
      persistent: state.persistent,
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

  /** 이 회원에 연동된 소셜 제공자 목록. 마이페이지의 열람에 쓴다. */
  async listLinked(userId: number): Promise<OAuthProvider[]> {
    const links = await this.oauths.listByUser(userId);
    return links.map((l) => l.provider);
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
    input: {
      ticket: string;
      email?: string | null;
      code?: string | null;
      consent: ConsentInput;
      /** 브라우저에서 뽑아 온 지역 설정. 이메일 가입과 같은 규칙으로 좁혀 저장한다. */
      clientLocale?: ClientLocaleInput;
    },
    meta: RequestMeta,
    locale?: string,
  ): Promise<AuthResult> {
    // **계정을 만들기 전에 막는다.** 이메일 가입과 같은 규칙이다.
    this.consent.assertValid(input.consent);

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
      ...resolveUserLocale(input.clientLocale ?? {}),
    });
    await this.oauths.create({
      userId: user.id,
      provider: payload.provider,
      providerId: payload.providerId,
      email: payload.email,
    });

    await this.consent.record(user.id, input.consent, meta);

    await this.log.record({
      userId: user.id,
      action: AuthLogAction.SIGNUP,
      result: AuthLogResult.SUCCESS,
      provider: toJoinType(payload.provider),
      ...meta,
    });

    /*
      가입 축하 메일만 보낸다. **연동 알림은 보내지 않는다** — 소셜로 가입한 사람에게
      "소셜이 연동되었습니다" 는 방금 한 가입을 두 번 말하는 것이다.
      연동 알림은 이미 쓰던 계정에 수단이 붙을 때의 신호다.
    */
    await this.mail.sendAccountNotice({
      to: user.email,
      kind: 'SIGNUP_WELCOME',
      locale: user.language ?? locale,
      userName: user.name,
    });

    const tokens = await this.login.complete(
      user,
      toJoinType(payload.provider),
      meta,
      payload.persistent ?? false,
    );
    return { user, tokens };
  }

  /**
   * 로그인이 성립했을 때 **무엇을 돌려줄지** 정한다.
   *
   *   자사(client_id 없음)  세션을 그 자리에서 발급한다. 같은 루트 도메인이라 쿠키를 심을 수
   *                        있으므로 인가코드가 필요 없고, 코드가 없으니 PKCE 도 없다.
   *   외부 앱(client_id)     쿠키를 심을 수 없으니 인가코드를 발급한다. 그 앱이 PKCE 로 교환한다.
   *
   * 예전에는 자사도 코드 경로를 타서 인증웹을 한 번 더 거쳤다. 로그인은 됐지만 왕복이 하나
   * 늘고, "자사는 쿠키로 끝난다" 는 프론트의 전제(hansapp-web 의 login.ts 주석)와 어긋났다.
   */
  private async completeLogin(
    userId: number,
    state: { clientId?: string; codeChallenge?: string; persistent?: boolean },
    provider: AuthProvider,
    meta: RequestMeta,
  ): Promise<CallbackOutcome> {
    if (state.clientId) {
      // state 의 clientId 를 코드에 박는다. 이 값은 진입 시 가드가 정했고 서명으로 보호된다 —
      // 그래야 토큰 교환 때 "이 코드는 medifinder 것" 을 서버가 알 수 있다.
      //
      // "로그인 상태 유지" 도 같이 박는다. 세션은 콜백이 아니라 **교환 시점**에 만들어지는데,
      // 그 요청에는 사용자의 선택이 없다 — 코드가 유일한 운반 수단이다.
      const code = await this.tokens.issueAuthCode(
        userId,
        state.clientId,
        state.codeChallenge ?? null,
        provider,
        state.persistent ?? false,
      );
      return { kind: 'code', code };
    }
    const user = await this.users.findById(userId);
    if (!user || user.status !== UserStatus.ACTIVE) {
      return { kind: 'error', error: 'invalid_account' };
    }
    return {
      kind: 'session',
      tokens: await this.login.complete(
        user,
        provider,
        meta,
        state.persistent ?? false,
      ),
    };
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
    locale?: string,
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
      action: AuthLogAction.OAUTH_UNLINK,
      result: AuthLogResult.SUCCESS,
      provider: toJoinType(provider),
      ...meta,
    });
    // 로그인 수단이 하나 줄었다. 남이 끊은 것이라면 이 메일로만 알 수 있다.
    await this.notifySocialChange(user, 'SOCIAL_UNLINKED', provider, locale);
  }

  /** 연동 처리(내부). intent=link 경로에서 호출된다. */
  private async handleLink(
    userId: number | undefined,
    profile: SocialProfile,
    existing: { userId: number } | null,
    meta: RequestMeta,
    locale?: string,
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
      action: AuthLogAction.OAUTH_LINK,
      result: AuthLogResult.SUCCESS,
      provider: toJoinType(profile.provider),
      ...meta,
    });
    // 이미 쓰던 계정에 로그인 수단이 하나 늘었다 — 본인이 한 일이 아니면 알아야 한다.
    await this.notifySocialChange(
      user,
      'SOCIAL_LINKED',
      profile.provider,
      locale,
    );
    return { kind: 'linked' };
  }
}
