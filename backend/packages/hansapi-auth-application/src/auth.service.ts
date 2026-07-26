import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';
import {
  ActionResult,
  AuthProvider,
  EmailVerifyPurpose,
  User,
  UserAction,
} from '@hansapi/data';

import { AUTH_CONFIG } from './auth.config';
import type { AuthConfig } from './auth.config';
import { EmailVerificationService } from './mail/email-verification.service';
import { ActionLogService } from './log/action-log.service';
import { UserRepository } from './repository/user.repository';
import { UserOAuthRepository } from './repository/user-oauth.repository';
import { TokenSessionRepository } from './repository/token-session.repository';
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
  constructor(
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    private readonly users: UserRepository,
    private readonly oauths: UserOAuthRepository,
    private readonly sessions: TokenSessionRepository,
    private readonly withdrawals: WithdrawalRepository,
    private readonly tokens: TokenService,
    private readonly log: ActionLogService,
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
    },
    meta: RequestMeta,
  ): Promise<AuthResult> {
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

    await this.log.record({
      userId: user.id,
      action: UserAction.SIGNUP,
      result: ActionResult.SUCCESS,
      provider: AuthProvider.EMAIL,
      ...meta,
    });

    const tokens = await this.issueLoginTokens(user, meta, AuthProvider.EMAIL);
    return { user, tokens };
  }

  /** 이메일 로그인. 소셜 전용 계정(비밀번호 없음)은 이메일 로그인이 불가하다. */
  async login(
    input: { email: string; password: string },
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

    const tokens = await this.issueLoginTokens(user, meta, AuthProvider.EMAIL);
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
    if (!user || !user.password) {
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

  // ---- 내부 헬퍼 ----

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

  private async issueLoginTokens(
    user: User,
    meta: RequestMeta,
    provider: AuthProvider,
  ): Promise<AuthTokens> {
    const tokens = await this.tokens.issueLogin(user.id, user.role, meta);
    await this.log.record({
      userId: user.id,
      action: UserAction.LOGIN,
      result: ActionResult.SUCCESS,
      provider,
      ...meta,
    });
    return tokens;
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
