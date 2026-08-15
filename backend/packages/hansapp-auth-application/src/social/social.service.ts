import { Inject, Injectable } from '@nestjs/common';
import { AuthErrorCode, VerificationCodeInvalidError } from '../error';
import { BadRequestError, ConflictError, UnauthorizedError } from '@hansapp/common';
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
import { ProfileCache } from '../profile-cache.service';
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
  /*
    외부 앱 로그인/자동연동 → 릴레이 인가코드.

    tokens 는 **우리 도메인의 세션**이다(있으면 컨트롤러가 쿠키로 심는다). 사용자가 방금
    우리 로그인 화면에서 인증했으니 HansApp 에도 로그인된 것이 맞다 — 그러지 않으면 포털에
    갔을 때 다시 로그인해야 한다. 코드는 그 사실 위에 얹혀 그 앱으로 나간다.
  */
  | { kind: 'code'; code: string; tokens?: AuthTokens }
  /*
    신규 → 가입 티켓.
      emailRequired  provider 가 이메일을 아예 안 줘서 입력이 **필수**다.
      emailEditable  provider 의 이메일이 검증된 값이 아니라 사용자가 **바꿀 수 있다**.
                     네이버·라인처럼 검증 신호가 없는 곳의 이메일은 identity 가 아니라
                     연락처라, 우리 계정의 주소로 그대로 굳히면 안 된다.
      codeRequired   provider 가 검증하지 않아 우리 코드 인증이 필요하다(구글만 false).
      email          프리필용. 없으면 사용자가 처음부터 입력한다.
      name           provider 가 준 표시 이름(프리필용). 사용자가 고칠 수 있다.
  */
  | {
      kind: 'pending';
      ticket: string;
      emailRequired: boolean;
      emailEditable: boolean;
      codeRequired: boolean;
      email?: string;
      name?: string;
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
  /**
   * 그 클라이언트의 PKCE challenge.
   *
   * 실패해서 로그인 화면으로 되돌릴 때 **이 흐름을 이어 갈 수 있게** 함께 넘긴다 —
   * 사용자가 거기서 문제를 풀고 로그인하면 인가코드가 원래 앱으로 이어져야 하는데,
   * 그러려면 로그인 화면이 client_id·redirect_uri 와 함께 이 값을 다시 들고 있어야 한다.
   */
  codeChallenge?: string;
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
    private readonly profileCache: ProfileCache,
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
    const existing = await this.oauths.findByProvider(profile.provider, profile.providerId);
    const outcome = await this.resolveOutcome(state, profile, existing, meta, locale);
    return {
      outcome,
      returnTo: state.returnTo,
      clientState: state.clientState,
      clientId: state.clientId,
      codeChallenge: state.codeChallenge,
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
      return this.completeLogin(existing.userId, state, toJoinType(profile.provider), meta);
    }

    /*
      미연동 → 신규 가입 흐름.

      **provider 가 검증한 이메일일 때만 기존 계정과 대조한다.** 네이버·라인처럼 검증 신호가
      없는 곳의 이메일은 identity 가 아니라 사용자가 바꿀 수 있는 연락처다(toNaver 주석 참고).
      그 값으로 "이미 가입된 이메일" 이라고 막으면 두 가지가 잘못된다 —

        · 연동할 수도 없으면서 가입도 막는다. 사용자는 아무 데도 못 간다.
        · 남의 이메일을 자기 소셜 연락처로 적어 두고 눌러 보면 그 주소의 가입 여부가 드러난다.

      그래서 검증되지 않은 이메일은 **아무 판단에도 쓰지 않고** 가입 화면의 기본값으로만
      건넨다. 거기서 사용자가 쓸 주소를 정하고, 우리 코드 인증으로 소유를 확인한다.
    */
    const email = profile.email ? normalizeEmail(profile.email) : null;
    if (email && profile.emailVerified) {
      const active = await this.users.findActiveByEmail(email);
      if (active) {
        // 자동 연동: **양쪽 이메일이 모두 검증된 경우에만** 안전하다(계정 탈취 방지).
        // provider 가 검증한 이메일(구글 등)이 이미 검증된 계정과 같으면 = 같은 사람이므로
        // 그 계정에 이 소셜을 연동하고 로그인시킨다.
        if (active.emailVerified) {
          await this.oauths.create({
            userId: active.id,
            provider: profile.provider,
            providerId: profile.providerId,
            email: profile.email,
          });
          // linkedProviders 가 바뀐다 — /users/me 응답을 이루는 값이다.
          await this.profileCache.invalidate(active.id);
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
          await this.notifySocialChange(active, 'SOCIAL_LINKED', profile.provider, locale);
          return this.completeLogin(active.id, state, toJoinType(profile.provider), meta);
        }
        // 기존 계정이 이메일을 검증한 적이 없으면 자동연동 금지 — 소유가 증명되지 않아
        // 탈취 위험이 있다. (그 계정으로 로그인해 직접 연동해야 한다.)
        return { kind: 'error', error: 'email_exists' };
      }
      const withdrawn = await this.withdrawals.findActiveByEmail(email, new Date());
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
      emailEditable: !profile.emailVerified,
      codeRequired: !profile.emailVerified,
      email: email ?? undefined,
      name: profile.name ?? undefined,
    };
  }

  /** 이 회원에 연동된 소셜 제공자 목록. 마이페이지의 열람에 쓴다. */
  async listLinked(userId: number): Promise<OAuthProvider[]> {
    const links = await this.oauths.listByUser(userId);
    return links.map((l) => l.provider);
  }

  /**
   * 이 가입에 쓸 이메일을 정한다. **코드 발송과 가입 확정이 같은 답을 봐야 한다** —
   * 갈리면 A 로 코드를 보내고 B 로 계정을 만들거나, 사용자가 고친 주소를 두고 엉뚱한 주소의
   * 중복을 검사하게 된다(실제로 발송 쪽이 티켓 값을 그대로 써서 그렇게 됐다).
   *
   * **검증된 provider 이메일만 고정값이다.** 그건 우리가 소유를 확인한 주소라 바꿔 들어오는
   * 것을 허용하면 코드 인증 없이 아무 주소로나 계정을 만들 수 있다. 검증되지 않은 값
   * (네이버·라인)은 화면에 채워 준 기본값일 뿐이라, 사용자가 고른 주소가 있으면 그쪽이다.
   */
  private resolveRegisterEmail(
    payload: { email?: string | null; emailVerified: boolean },
    input?: string | null,
  ): string {
    const providerEmail = payload.email ? normalizeEmail(payload.email) : null;
    if (payload.emailVerified && providerEmail) return providerEmail;
    return normalizeEmail(input ?? providerEmail ?? '');
  }

  /**
   * 소셜 가입 코드 발송. 사용자가 고른 이메일로 보낸다(검증된 provider 이메일이면 그 값).
   * provider 가 이미 검증한 이메일이면 코드가 필요 없다(호출하지 않는다).
   */
  async requestRegisterCode(
    ticket: string,
    emailInput?: string | null,
    locale?: string,
  ): Promise<void> {
    const payload = this.tickets.verifyRegister(ticket);
    const email = this.resolveRegisterEmail(payload, emailInput);
    if (!email) {
      throw new BadRequestError(AuthErrorCode.SOCIAL_PROFILE_UNAVAILABLE, {
        message: 'Email is required.',
      });
    }
    await this.authService.assertEmailAvailable(email);
    await this.emailVerification.issueAndSend(EmailVerifyPurpose.SIGNUP, email, {
      locale,
    });
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
      /** 가입 화면에서 고른 표시 이름. 비우면 provider 가 준 이름을 쓴다. */
      name?: string | null;
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
    const dup = await this.oauths.findByProvider(payload.provider, payload.providerId);
    if (dup) {
      throw new ConflictError(AuthErrorCode.SOCIAL_LINK_CONFLICT);
    }

    // 발송 때와 **같은 규칙**으로 정한다(resolveRegisterEmail 주석 참고).
    const email = this.resolveRegisterEmail(payload, input.email);
    if (!email) {
      throw new BadRequestError(AuthErrorCode.SOCIAL_PROFILE_UNAVAILABLE, {
        message: 'Email is required.',
      });
    }
    await this.authService.assertEmailAvailable(email);

    // provider 가 준 검증 이메일을 그대로 쓸 때만 provider 검증으로 인정한다(사용자 입력은 미검증).
    const providerVerified =
      payload.emailVerified && !!payload.email && normalizeEmail(payload.email) === email;

    // provider 가 검증하지 않았으면 우리 코드로 소유를 증명해야 한다.
    if (!providerVerified) {
      if (!input.code) {
        throw new BadRequestError(AuthErrorCode.AUTH_VERIFICATION_CODE_REQUIRED);
      }
      const ok = await this.emailVerification.verify(EmailVerifyPurpose.SIGNUP, email, input.code);
      if (!ok) {
        throw new VerificationCodeInvalidError();
      }
    }

    const user = await this.users.create({
      email,
      emailVerified: true,
      password: null,
      /*
        **이름은 사용자가 고른 값이 이긴다.** provider 의 표시 이름은 그 서비스에서 쓰던
        별명이라, 우리 계정에서까지 그 이름이어야 할 이유가 없다. 안 고쳤으면 화면이
        기본값(provider 이름)을 그대로 돌려보내므로 결과는 같다.
      */
      name: input.name?.trim() || payload.name,
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
    const user = await this.users.findById(userId);
    if (!user || user.status !== UserStatus.ACTIVE) {
      return { kind: 'error', error: 'invalid_account' };
    }
    const persistent = state.persistent ?? false;

    if (state.clientId) {
      // state 의 clientId 를 코드에 박는다. 이 값은 진입 시 가드가 정했고 서명으로 보호된다 —
      // 그래야 토큰 교환 때 "이 코드는 medifinder 것" 을 서버가 알 수 있다.
      //
      // "로그인 상태 유지" 도 같이 박는다. 그 앱의 세션은 콜백이 아니라 **교환 시점**에
      // 만들어지는데, 그 요청에는 사용자의 선택이 없다 — 코드가 유일한 운반 수단이다.
      const code = await this.tokens.issueAuthCode(
        userId,
        state.clientId,
        state.codeChallenge ?? null,
        provider,
        persistent,
      );
      /*
        **우리 세션도 함께 만든다.** 사용자는 우리 로그인 화면에서 인증했다 — 그 사실은
        어느 앱이 보냈는지와 무관하다. 이게 없으면 medifinder 로 로그인한 사람이 포털에
        가서 다시 로그인해야 했다(이메일 로그인 경로는 이미 이렇게 하고 있었다).

        쿠키 수명은 "로그인 상태 유지" 를 따른다 — 안 골랐으면 세션 쿠키라 브라우저를
        닫을 때 사라진다.
      */
      return {
        kind: 'code',
        code,
        tokens: await this.login.complete(user, provider, meta, persistent),
      };
    }
    return {
      kind: 'session',
      tokens: await this.login.complete(user, provider, meta, persistent),
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
      throw new UnauthorizedError(AuthErrorCode.AUTH_ACCOUNT_DISABLED, {
        message: 'Invalid account.',
      });
    }
    const links = await this.oauths.listByUser(userId);
    const target = links.find((l) => l.provider === provider);
    if (!target) {
      throw new BadRequestError(AuthErrorCode.SOCIAL_PROVIDER_NOT_LINKED);
    }
    // 비밀번호도 없고 이 연동이 유일한 로그인 수단이면 해제 불가.
    if (!user.password && links.length <= 1) {
      throw new BadRequestError(AuthErrorCode.SOCIAL_UNLINK_LAST_METHOD);
    }
    await this.oauths.delete(userId, provider);
    await this.profileCache.invalidate(userId);
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
    await this.profileCache.invalidate(userId);
    await this.log.record({
      userId,
      action: AuthLogAction.OAUTH_LINK,
      result: AuthLogResult.SUCCESS,
      provider: toJoinType(profile.provider),
      ...meta,
    });
    // 이미 쓰던 계정에 로그인 수단이 하나 늘었다 — 본인이 한 일이 아니면 알아야 한다.
    await this.notifySocialChange(user, 'SOCIAL_LINKED', profile.provider, locale);
    return { kind: 'linked' };
  }
}
