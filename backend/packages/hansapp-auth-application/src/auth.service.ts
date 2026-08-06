import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';
import {
  ActionResult,
  AuthProvider,
  EmailVerifyPurpose,
  User,
  UserAction,
} from '@hansapp/data';

import { AUTH_CONFIG } from './auth.config';
import type { AuthConfig } from './auth.config';
import { EmailVerificationService } from './mail/email-verification.service';
import { MailService } from './mail/mail.service';
import { ConsentService, type ConsentInput } from './consent.service';
import { ActionLogService } from './log/action-log.service';
import { LoginService } from './login.service';
import { UserRepository } from './repository/user.repository';
import { UserOAuthRepository } from './repository/user-oauth.repository';
import { TokenSessionRepository } from './repository/token-session.repository';
import type { UserTokenSession } from '@hansapp/data';
import { WithdrawalRepository } from './repository/withdrawal.repository';
import { AuthTokens, TokenService } from './token/token.service';

/** 요청 부가정보(로그·세션 기록용). */
export interface RequestMeta {
  readonly userAgent?: string | null;
  readonly ip?: string | null;
}

/** 로그인/가입 결과. */
export interface AuthResult {
  readonly user: User;
  readonly tokens: AuthTokens;
}

/**
 * 이메일 계정 인증 서비스. 가입·로그인·탈퇴·비밀번호 관리를 담당한다.
 * 소셜 연동은 OAuthService 가, 토큰 발급 기계는 TokenService 가 담당한다.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly consent: ConsentService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    private readonly users: UserRepository,
    private readonly oauths: UserOAuthRepository,
    private readonly mail: MailService,
    private readonly sessions: TokenSessionRepository,
    private readonly withdrawals: WithdrawalRepository,
    private readonly tokens: TokenService,
    private readonly log: ActionLogService,
    private readonly loginService: LoginService,
    private readonly emailVerification: EmailVerificationService,
  ) {}

  /**
   * 가입용 인증 코드 발송. **계정 생성 전** 단계다 — 이메일 소유를 먼저 증명시킨다.
   * 이미 가입된 이메일이면 거부한다(가입은 어차피 최종 단계에서 중복을 드러낸다).
   */
  async requestSignupCode(emailRaw: string, locale?: string): Promise<void> {
    const email = normalizeEmail(emailRaw);
    await this.assertEmailAvailable(email);
    await this.emailVerification.issueAndSend(
      EmailVerifyPurpose.SIGNUP,
      email,
      {
        locale,
      },
    );
  }

  /**
   * 이메일 가입. **가입 전에 발송된 코드 검증을 통과해야** 계정을 만든다 —
   * 검증된 이메일만 계정을 소유하므로 스쿼팅·미검증 계정이 생기지 않는다.
   * 성공 시 계정은 emailVerified=true 로 생성되고 곧바로 로그인 토큰을 발급한다.
   * 중복 체크는 활성 계정과 탈퇴 기록(재가입 제한기간)을 함께 본다.
   */
  async signup(
    input: {
      email: string;
      password: string;
      name?: string | null;
      code: string;
      consent: ConsentInput;
    },
    meta: RequestMeta,
  ): Promise<AuthResult> {
    // **계정을 만들기 전에 막는다.** 통과 못 하면 아무것도 생기지 않는다.
    this.consent.assertValid(input.consent);

    const email = normalizeEmail(input.email);
    await this.assertEmailAvailable(email);

    const verified = await this.emailVerification.verify(
      EmailVerifyPurpose.SIGNUP,
      email,
      input.code,
    );
    if (!verified) {
      throw new BadRequestException('Invalid or expired verification code.');
    }

    const user = await this.users.create({
      email,
      emailVerified: true,
      password: await this.hashPassword(input.password),
      name: input.name ?? null,
      joinType: AuthProvider.EMAIL,
    });

    await this.consent.record(user.id, input.consent, meta);

    await this.log.record({
      userId: user.id,
      action: UserAction.SIGNUP,
      result: ActionResult.SUCCESS,
      provider: AuthProvider.EMAIL,
      ...meta,
    });

    /*
      가입 직후 로그인은 **유지하지 않는다**(세션 쿠키). 가입 화면에는 "로그인 상태 유지"
      체크가 없어서 이용자가 고른 적이 없는데, 고르지 않은 것을 켠 것으로 볼 이유가 없다.
      로그인 화면에서 체크를 안 했을 때와 같은 결과가 된다.
    */
    const tokens = await this.issueLoginTokens(
      user,
      meta,
      AuthProvider.EMAIL,
      false,
    );
    return { user, tokens };
  }

  /** 이메일 로그인. 소셜 전용 계정(비밀번호 없음)은 이메일 로그인이 불가하다. */
  async login(
    input: { email: string; password: string; rememberMe?: boolean },
    meta: RequestMeta,
  ): Promise<AuthResult> {
    const email = normalizeEmail(input.email);
    const user = await this.users.findActiveByEmail(email);

    const ok =
      !!user &&
      !!user.password &&
      (await bcrypt.compare(input.password, user.password));
    if (!user || !ok) {
      await this.log.record({
        userId: user?.id ?? null,
        action: UserAction.LOGIN,
        result: ActionResult.FAIL,
        provider: AuthProvider.EMAIL,
        failReason: !user ? 'user_not_found' : 'bad_credentials',
        ...meta,
      });
      throw new UnauthorizedException('Invalid email or password.');
    }

    const tokens = await this.issueLoginTokens(
      user,
      meta,
      AuthProvider.EMAIL,
      // 체크를 안 했으면 세션 쿠키다 — 브라우저를 닫을 때 사라진다.
      input.rememberMe ?? false,
    );
    return { user, tokens };
  }

  /**
   * 탈퇴. 상태를 WITHDRAWN 으로 바꾸고(로그인 차단), 모든 세션·소셜 연동을 제거하며,
   * 개인정보 최소항목을 탈퇴 기록에 남긴다. 하드삭제와 이메일 해제는 30일 뒤 배치가 수행한다.
   */
  async withdraw(userId: number, meta: RequestMeta): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user || user.status === 'WITHDRAWN') {
      throw new BadRequestException('Account is withdrawn or does not exist.');
    }

    const now = new Date();
    const purgeAt = new Date(
      now.getTime() + this.config.withdrawalRetentionDays * 24 * 60 * 60 * 1000,
    );
    await this.withdrawals.create({
      originalUserId: user.id,
      email: user.email,
      name: user.name,
      purgeAt,
    });
    await this.users.markWithdrawn(user.id, now);
    await this.sessions.deleteAllByUser(user.id);
    // 소셜 연동 개인정보 제거(재로그인 시 신규 취급 → 30일 재가입 차단에 걸린다).
    await this.deleteAllOAuthLinks(user.id);

    await this.log.record({
      userId: user.id,
      action: UserAction.WITHDRAW,
      result: ActionResult.SUCCESS,
      ...meta,
    });
  }

  /** 비밀번호 변경(로그인 상태). 변경 후 다른 세션은 유지한다(정책 필요 시 전체 로그아웃으로 강화). */
  async changePassword(
    userId: number,
    input: { currentPassword: string; newPassword: string },
    meta: RequestMeta,
  ): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid account.');
    }
    if (
      !user.password ||
      !(await bcrypt.compare(input.currentPassword, user.password))
    ) {
      await this.log.record({
        userId: user.id,
        action: UserAction.PASSWORD_CHANGE,
        result: ActionResult.FAIL,
        failReason: 'bad_credentials',
        ...meta,
      });
      throw new UnauthorizedException('Current password is incorrect.');
    }
    await this.users.updatePassword(
      user.id,
      await this.hashPassword(input.newPassword),
    );
    await this.log.record({
      userId: user.id,
      action: UserAction.PASSWORD_CHANGE,
      result: ActionResult.SUCCESS,
      ...meta,
    });
  }

  /**
   * 비밀번호 재설정 코드 발송. 소셜 전용 계정(비밀번호 없음)은 재설정 대상이 아니다.
   * 존재하지 않는/대상이 아닌 이메일도 동일 응답(202)을 위해 조용히 넘어간다(계정 유무 노출 방지).
   */
  async requestPasswordReset(emailRaw: string, locale?: string): Promise<void> {
    const email = normalizeEmail(emailRaw);
    const user = await this.users.findActiveByEmail(email);
    if (!user) {
      this.logSkippedReset(email, '가입된 계정 없음');
      return;
    }
    if (!user.password) {
      /*
        **소셜로만 가입한 계정이다. 재설정할 비밀번호가 없다.**

        화면에는 이 사실을 알려 주지 않는다 — 알려 주면 가입 여부와 어느 제공자인지까지
        공격자에게 새어 나간다. 대신 **받은 편지함을 가진 진짜 주인에게** 메일로 알린다.
        그러면 화면은 계속 같은 말을 하면서도 정작 도움이 필요한 사람은 길을 찾는다.
      */
      const links = await this.oauths.listByUser(user.id);
      await this.mail.sendSocialOnlyNotice({
        to: email,
        providers: links.map((l) => l.provider),
        locale,
        userNameGreeting: user.name ? ` ${user.name}님` : '',
      });
      this.logSkippedReset(
        email,
        '비밀번호 없는 계정(소셜 전용) → 안내 메일 발송',
      );
      return;
    }
    await this.emailVerification.issueAndSend(
      EmailVerifyPurpose.PASSWORD_RESET,
      email,
      { locale },
    );
  }

  /** 메일로 받은 코드로 새 비밀번호를 설정한다. 성공 시 전체 세션을 폐기한다(보안). */
  async resetPassword(
    input: { email: string; code: string; newPassword: string },
    meta: RequestMeta,
  ): Promise<void> {
    const email = normalizeEmail(input.email);
    const ok = await this.emailVerification.verify(
      EmailVerifyPurpose.PASSWORD_RESET,
      email,
      input.code,
    );
    if (!ok) {
      throw new BadRequestException('Invalid or expired verification code.');
    }
    const user = await this.users.findActiveByEmail(email);
    if (!user) {
      throw new BadRequestException('Account not found.');
    }
    await this.users.updatePassword(
      user.id,
      await this.hashPassword(input.newPassword),
    );
    await this.sessions.deleteAllByUser(user.id);
    await this.log.record({
      userId: user.id,
      action: UserAction.PASSWORD_RESET,
      result: ActionResult.SUCCESS,
      ...meta,
    });
  }

  /** 현재 로그인 사용자 프로필 조회. 비활성 계정은 거부한다. */
  async getProfile(userId: number): Promise<User> {
    const user = await this.users.findById(userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid account.');
    }
    return user;
  }

  /**
   * 표시 이름을 바꾼다. **개인정보처리방침 제10조의 "정정" 을 이행하는 자리다.**
   *
   * 이름은 우리가 검증할 수 있는 값이 아니라(본인확인이 없다) 형식만 본다. 지우고 싶으면
   * 빈 문자열을 보내면 되고, 그때는 null 로 남긴다 — 빈 문자열과 "없음" 을 DB 에서 갈라 두면
   * 화면마다 둘 다 처리해야 한다.
   *
   * **행동 로그를 남기지 않는다.** UserAction 에 맞는 값이 없고(로그인·비밀번호·탈퇴 등
   * 계정 보안 사건만 남긴다), 표시 이름 변경은 거기 낄 성질이 아니다. 남길 이유가 생기면
   * 그때 enum 을 늘린다.
   */
  async updateName(userId: number, name: string): Promise<User> {
    await this.getProfile(userId);
    const trimmed = name.trim();
    return this.users.updateName(userId, trimmed || null);
  }

  /**
   * 로그인한 기기 목록. **계정 이용약관 제6조④가 약속한 것을 이행하는 자리다.**
   *
   * 개인정보처리방침 제1조에 "로그인 세션에 IP 와 기기 정보를 담는다" 고 적어 둔 이상,
   * 본인이 그것을 보고 지울 수 있어야 한다.
   */
  listSessions(userId: number): Promise<UserTokenSession[]> {
    return this.sessions.listActiveByUser(userId, new Date());
  }

  /**
   * 기기 하나를 로그아웃시킨다. **내 세션만 지운다**(저장소가 userId 를 조건에 함께 넣는다).
   * 남의 세션 식별자를 넣어도 아무 일이 일어나지 않는다.
   */
  async revokeSession(userId: number, sessionId: string): Promise<void> {
    const removed = await this.sessions.deleteOwned(userId, sessionId);
    if (!removed) {
      throw new BadRequestException('Session not found.');
    }
  }

  /**
   * 모든 기기에서 로그아웃. **지금 이 기기까지 포함해 전부 지운다.**
   *
   * 계정이 도용됐다고 의심할 때 누르는 버튼이다. 목록에서 하나씩 끊는 것으로는 그 사이에
   * 새로 만들어진 세션을 놓칠 수 있고, 무엇을 놓쳤는지도 알 수 없다 — 다 지우고 다시
   * 로그인하는 편이 확실하다.
   *
   * **지금 이 기기를 빼지 않는 이유.** 버튼에 "모든" 이라고 쓰여 있으면 정말 모두여야 한다.
   * 하나를 남기면 "왜 아직 로그인돼 있지" 를 사용자가 다시 의심하게 된다. 비밀번호를
   * 바꾸라는 안내가 그다음에 오는데, 그 흐름도 어차피 재로그인에서 시작한다.
   */
  async revokeAllSessions(userId: number, meta: RequestMeta): Promise<number> {
    const removed = await this.sessions.deleteAllByUser(userId);
    await this.log.record({
      userId,
      action: UserAction.LOGOUT,
      result: ActionResult.SUCCESS,
      ...meta,
    });
    return removed;
  }

  // ---- 내부 헬퍼 ----

  /**
   * 재설정 메일을 **왜 안 보냈는지** 남긴다. 운영에서는 아무것도 남기지 않는다.
   *
   * 이 흐름은 계정 열거를 막으려고 있는 계정이든 없는 계정이든 똑같이 202 를 준다. 화면도
   * "메일을 보냈다" 로 같다 — 그래서 로컬에서 안 오는 이유를 찾을 방법이 없었다.
   *
   * **운영에서 찍으면 방어가 무너진다.** 응답으로는 숨겨 놓고 로그로 흘리면, 로그를 볼 수 있는
   * 사람에게는 가입 여부가 그대로 드러난다. 그래서 production 에서는 한 줄도 남기지 않는다.
   */
  private logSkippedReset(email: string, reason: string): void {
    if (process.env.APP_ENV === 'production') return;
    this.logger.warn(
      `[dev] 비밀번호 재설정 메일을 보내지 않았습니다 — ${reason}. to=${email}`,
    );
  }

  /** 이메일이 신규 가입 가능한지 검증한다(활성 계정·탈퇴 재가입 제한 모두 확인). */
  async assertEmailAvailable(email: string): Promise<void> {
    const active = await this.users.findActiveByEmail(email);
    if (active) {
      throw new ConflictException('Email already registered.');
    }
    const withdrawn = await this.withdrawals.findActiveByEmail(
      email,
      new Date(),
    );
    if (withdrawn) {
      throw new ConflictException(
        'Re-signup is restricted after withdrawal. Please try again later.',
      );
    }
  }

  /** 세션 발급 + 로그인 로그. **모든 로그인 경로가 지나는 자리다**(LoginService). */
  private issueLoginTokens(
    user: User,
    meta: RequestMeta,
    provider: AuthProvider,
    persistent = true,
  ): Promise<AuthTokens> {
    return this.loginService.complete(user, provider, meta, persistent);
  }

  private hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.config.bcryptRounds);
  }

  private async deleteAllOAuthLinks(userId: number): Promise<void> {
    const links = await this.oauths.listByUser(userId);
    for (const link of links) {
      await this.oauths.delete(userId, link.provider);
    }
  }
}

/** 이메일 정규화(소문자·trim). 중복 판정을 대소문자 무관하게 만든다. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
