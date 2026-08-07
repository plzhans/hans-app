import { randomBytes } from 'node:crypto';

import {
  ConflictException,
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { AdminStatus, AdminUser } from '@hansapp/data';

import { ADMIN_AUTH_CONFIG } from './admin-auth.config';
import type { AdminAuthConfig } from './admin-auth.config';
import { AdminActionLogService } from './admin-action-log.service';
import { AdminLoginService } from './admin-login.service';
import { AdminTokenService } from './admin-token.service';
import type { AdminAuthTokens, AdminRequestMeta } from './admin-token.service';
import { AdminUserRepository } from './admin-user.repository';

/** 로그인 실패는 사유를 가리지 않고 이 문장 하나로 답한다. */
const LOGIN_FAILED = 'Invalid email or password.';

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);
  private dummyHash?: string;

  constructor(
    @Inject(ADMIN_AUTH_CONFIG) private readonly config: AdminAuthConfig,
    private readonly admins: AdminUserRepository,
    private readonly tokens: AdminTokenService,
    private readonly loginFlow: AdminLoginService,
    private readonly log: AdminActionLogService,
  ) {}

  /**
   * 이메일/비밀번호 로그인.
   *
   * 실패 사유(계정 없음·비밀번호 불일치·비활성 계정)를 응답에서 구분하지 않는다.
   * 관리자 계정은 몇 개뿐이라 "이 이메일이 관리자다" 하나만 새도 표적이 좁혀진다.
   */
  async login(
    input: { email: string; password: string },
    meta: AdminRequestMeta,
  ): Promise<AdminAuthTokens> {
    const email = normalizeEmail(input.email);
    const admin = await this.admins.findByEmail(email);

    /*
      **계정이 없어도 대조는 한 번 돌린다.** 없다고 곧장 실패로 빠지면 bcrypt 를 건너뛰어
      응답이 그만큼(코스트 10 기준 ~80ms) 빨리 돌아오고, 그 시간차가 "이 이메일은 관리자다" 를
      말해 준다 — 메시지를 똑같이 맞춰 둔 의미가 없어진다.
    */
    const matched = await bcrypt.compare(
      input.password,
      admin?.password ?? this.getDummyHash(),
    );

    const failReason = !admin
      ? 'admin_not_found'
      : admin.status !== AdminStatus.ACTIVE
        ? 'account_disabled'
        : !matched
          ? 'bad_credentials'
          : null;

    if (failReason || !admin) {
      await this.log.record({
        adminId: admin?.id ?? null,
        email,
        action: 'LOGIN',
        result: 'FAIL',
        failReason,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      throw new UnauthorizedException(LOGIN_FAILED);
    }

    // 평문을 손에 쥐는 유일한 순간이라 여기서 해 둔다.
    await this.rehashIfStale(admin, input.password);

    return this.loginFlow.complete(admin, meta);
  }

  /** refresh token 으로 access token 을 갱신한다. refresh 도 rotate 된다. */
  async refresh(refreshToken: string): Promise<AdminAuthTokens> {
    const rotated = await this.tokens.rotateRefreshToken(refreshToken);

    /*
      **갱신 때마다 계정 상태를 다시 본다.** access token 은 stateless 라 발급 뒤 폐기가
      안 되는데, 갱신을 막으면 최대 access TTL(5분) 뒤에는 실제로 끊긴다. 이게 계정
      비활성화가 실효를 갖는 유일한 경로다.
    */
    const admin = await this.admins.findById(rotated.adminId);
    if (!admin || admin.status !== AdminStatus.ACTIVE) {
      await this.tokens.revokeSession(rotated.sessionId);
      throw new UnauthorizedException('Account is not active.');
    }

    // **여기서 DB 값을 다시 읽어 싣는다.** 비밀번호를 바꾸면 다음 갱신에서 플래그가
    // 자연히 풀리고, 반대로 운영자가 초기화하면 다음 갱신부터 다시 막힌다.
    return this.tokens.buildTokens(
      rotated.adminId,
      rotated,
      admin.mustChangePassword,
    );
  }

  /** 로그아웃. **자격증명을 요구하지 않는다** — 잘못된 토큰이면 지울 것이 없을 뿐이다. */
  async logout(
    refreshToken: string | undefined,
    meta: AdminRequestMeta,
  ): Promise<void> {
    if (!refreshToken) return;
    const revoked = await this.tokens.revokeByRefreshToken(refreshToken);
    if (!revoked) return;
    await this.log.record({
      adminId: revoked.adminId,
      action: 'LOGOUT',
      result: 'SUCCESS',
      sessionId: revoked.sessionId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  /**
   * 본인이 자기 비밀번호를 바꾼다. **현재 비밀번호를 반드시 확인한다.**
   *
   * 강제 변경 상태에서도 이 확인을 빼지 않는다 — 그 상태의 access token 을 손에 넣은
   * 사람이 곧바로 비밀번호를 갈아 계정을 가져갈 수 있으면 강제 변경이 오히려 통로가 된다.
   * (남이 정해 준 값이라도 "지금 값" 은 알고 있어야 바꿀 수 있다.)
   *
   * 바꾼 뒤 **모든 세션을 끊고 새 세션을 하나 낸다.** 유출됐을 수 있는 비밀번호로 열린
   * 다른 세션을 남겨 두면 바꾼 의미가 없고, 본인은 다시 로그인하지 않아도 되게 한다.
   */
  async changeOwnPassword(
    adminId: number,
    input: { currentPassword: string; newPassword: string },
    meta: AdminRequestMeta,
  ): Promise<AdminAuthTokens> {
    const admin = await this.admins.findById(adminId);
    if (!admin || admin.status !== AdminStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active.');
    }

    if (!(await bcrypt.compare(input.currentPassword, admin.password))) {
      await this.log.record({
        adminId: admin.id,
        email: admin.email,
        action: 'PASSWORD_CHANGE',
        result: 'FAIL',
        failReason: 'bad_current_password',
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      throw new UnauthorizedException('Current password does not match.');
    }

    // 같은 값으로 바꾸면 강제 변경을 형식적으로 통과하는 셈이라 막는다.
    if (await bcrypt.compare(input.newPassword, admin.password)) {
      throw new BadRequestException(
        'New password must differ from the current one.',
      );
    }

    await this.admins.updatePassword(
      admin.id,
      await this.hashPassword(input.newPassword),
      // 본인이 정한 값이다. 여기서 강제가 풀린다.
      false,
    );
    await this.tokens.revokeAllByAdmin(admin.id);

    await this.log.record({
      adminId: admin.id,
      email: admin.email,
      action: 'PASSWORD_CHANGE',
      result: 'SUCCESS',
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    /*
      세션을 전부 끊었으니 새로 하나 낸다.

      **`admin` 을 그대로 넘기면 안 된다** — 그 값은 갱신 전에 읽은 것이라
      mustChangePassword 가 아직 true 다. 그대로 넘기면 방금 비밀번호를 바꿨는데도
      새 토큰에 chg 클레임이 실려 계속 막힌다.
    */
    return this.loginFlow.complete(
      { ...admin, mustChangePassword: false },
      meta,
    );
  }

  // ---- 계정 관리(CLI 전용) ----

  /** 관리자 계정 수. 부팅 시 기본 계정을 만들지 정하는 데 쓴다. */
  countAdmins(): Promise<number> {
    return this.admins.count();
  }

  /**
   * 관리자 계정을 만든다. **가입 화면은 없다** — CLI 로만 부른다.
   *
   * @param plainPassword 없으면 임시 비밀번호를 만들어 반환한다(호출측이 1회 출력한다).
   */
  async createAdmin(input: {
    email: string;
    name?: string | null;
    plainPassword?: string;
  }): Promise<{ admin: AdminUser; generatedPassword?: string }> {
    const email = normalizeEmail(input.email);
    /*
      **여기서 형식을 본다.** 로그인 API 의 DTO 가 class-validator 의 IsEmail 로 거르는데,
      계정을 만드는 CLI 에는 그 DTO 가 없다. 그래서 `admin@local` 같은 값으로 계정이 만들어지고
      그 계정은 영영 로그인하지 못한다 — 만들 때는 성공했으니 원인을 찾기도 어렵다.
      두 통로가 같은 기준을 쓰도록 계정을 만드는 이 자리에서 막는다.
    */
    if (!isEmailLike(email)) {
      throw new BadRequestException(
        `Not a valid email address: ${input.email}`,
      );
    }
    if (await this.admins.findByEmail(email)) {
      throw new ConflictException('Email already registered.');
    }
    const plain = input.plainPassword ?? generatePassword();
    // 만들어 준 경우에만 호출측에 돌려준다 — 받아 온 평문을 되돌려 줄 이유는 없다.
    const generated = input.plainPassword ? undefined : plain;

    const admin = await this.admins.create({
      email,
      password: await this.hashPassword(plain),
      name: input.name?.trim() || null,
      /*
        **남이 정해 준 비밀번호는 예외 없이 변경 대상이다.**
        stdin 으로 받은 값이라 해도 운영자가 정해 건네준 것이고, 그 값은 터미널·메신저를
        한 번은 거쳐 왔다. 본인만 아는 값이 될 때까지는 업무 API 를 열지 않는다.
      */
      mustChangePassword: true,
    });
    return { admin, generatedPassword: generated };
  }

  /**
   * 비밀번호를 강제로 바꾼다(현재 비밀번호를 묻지 않는다 — 운영자용). 모든 세션을 끊는다.
   *
   * @param plainPassword 없으면 임시 비밀번호를 만들어 반환한다(createAdmin 과 같은 규칙).
   */
  async resetPassword(
    email: string,
    plainPassword?: string,
  ): Promise<{ admin: AdminUser; generatedPassword?: string }> {
    const admin = await this.requireByEmail(email);
    const plain = plainPassword ?? generatePassword();
    const generated = plainPassword ? undefined : plain;

    const updated = await this.admins.updatePassword(
      admin.id,
      await this.hashPassword(plain),
      // 운영자가 정해 준 값이다. 본인이 다시 바꿔야 한다.
      true,
    );
    // 비밀번호를 바꾼 이유가 유출일 수 있다. 살아 있는 세션을 남겨 두면 바꾼 의미가 없다.
    await this.tokens.revokeAllByAdmin(admin.id);
    return { admin: updated, generatedPassword: generated };
  }

  /** 계정을 비활성화한다. 살아 있는 세션도 함께 끊는다. */
  async disable(email: string): Promise<AdminUser> {
    const admin = await this.requireByEmail(email);
    const updated = await this.admins.updateStatus(
      admin.id,
      AdminStatus.DISABLED,
    );
    await this.tokens.revokeAllByAdmin(admin.id);
    return updated;
  }

  async enable(email: string): Promise<AdminUser> {
    const admin = await this.requireByEmail(email);
    return this.admins.updateStatus(admin.id, AdminStatus.ACTIVE);
  }

  /**
   * 계정을 지운다. 세션은 FK Cascade 로 함께 사라진다.
   *
   * **마지막 남은 계정은 지우지 않는다.** 지우고 나면 로그인할 수단이 없어지고, 관리자
   * 계정을 만드는 통로는 이 CLI 뿐이라 서버에 다시 들어가야 풀린다. 부팅 자동 생성은
   * local·develop 에서만 도니 운영에서는 스스로 복구되지도 않는다.
   */
  async removeAdmin(email: string): Promise<AdminUser> {
    const admin = await this.requireByEmail(email);
    if ((await this.admins.count()) <= 1) {
      throw new BadRequestException(
        'Cannot remove the last admin account — no one could sign in afterwards.',
      );
    }
    await this.admins.delete(admin.id);
    return admin;
  }

  listAdmins(): Promise<AdminUser[]> {
    return this.admins.listAll();
  }

  findById(id: number): Promise<AdminUser | null> {
    return this.admins.findById(id);
  }

  // ---- 내부 ----

  private async requireByEmail(email: string): Promise<AdminUser> {
    const admin = await this.admins.findByEmail(normalizeEmail(email));
    if (!admin) {
      // CLI 경로라 계정 존재를 숨길 이유가 없다 — 오히려 오타를 알려 줘야 한다.
      throw new NotFoundException(`Admin not found: ${email}`);
    }
    return admin;
  }

  private hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.config.bcryptRounds);
  }

  /**
   * **평문을 난수로 뽑는다.** 상수 문자열을 쓰면 그 값이 곧 백도어가 된다 — 지금은 뒤에서
   * `admin` 존재를 함께 보지만, 나중에 누가 그 조건을 정리하다 지우면 소스에 적힌 그 문자열로
   * 로그인된다. 프로세스마다 한 번 만들어 재사용한다(부팅을 80ms 늦추지 않으려고 첫 사용 때).
   */
  private getDummyHash(): string {
    this.dummyHash ??= bcrypt.hashSync(
      randomBytes(32).toString('base64'),
      this.config.bcryptRounds,
    );
    return this.dummyHash;
  }

  /** 저장된 해시가 지금 설정보다 약한 코스트면 조용히 다시 해시한다. 실패해도 로그인은 통과. */
  private async rehashIfStale(admin: AdminUser, plain: string): Promise<void> {
    if (bcrypt.getRounds(admin.password) >= this.config.bcryptRounds) return;
    try {
      // 같은 비밀번호를 코스트만 올려 다시 저장하는 것이다 — 변경 강제 플래그는 그대로 둔다.
      await this.admins.updatePassword(
        admin.id,
        await this.hashPassword(plain),
        admin.mustChangePassword,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to rehash password for admin ${admin.id}: ${String(error)}`,
      );
    }
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * 로그인 DTO 의 IsEmail 이 통과시킬 모양인지 본다.
 *
 * 완전한 RFC 5322 검사가 아니다 — 그건 여기서 할 일이 아니고, 목적은 "만들어 놓고 로그인이
 * 안 되는 계정" 을 막는 것뿐이다. 공백 없이 `@` 하나, 도메인에 점이 하나 이상이면 된다.
 */
function isEmailLike(email: string): boolean {
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email);
}

/**
 * 임시 비밀번호. **12자다.**
 *
 * base64url 이라 셸에서 따옴표 없이 붙여 넣어도 안전하다(`+`·`/`·`=` 가 없다).
 * 9바이트 = 72비트 엔트로피라 사람이 고른 비밀번호보다 훨씬 강하고, 그러면서
 * 로그에서 한 번 보고 옮겨 적을 만한 길이다.
 *
 * 짧아도 되는 이유는 **수명이 한 번뿐**이기 때문이다 — 이 값으로 로그인하면 곧바로
 * 변경을 강제하므로, 오래 버텨야 하는 비밀번호가 아니다.
 * (9바이트를 base64url 로 옮기면 남는 비트가 없어 정확히 12자가 된다.)
 */
function generatePassword(): string {
  return randomBytes(9).toString('base64url');
}
