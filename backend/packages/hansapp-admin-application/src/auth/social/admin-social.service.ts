import { Injectable } from '@nestjs/common';
import { AdminStatus, OAuthProvider } from '@hansapp/data';

import { AdminActionLogService } from '../admin-action-log.service';
import { normalizeEmail } from '../admin-email';
import { AdminLoginService } from '../admin-login.service';
import type { AdminAuthTokens, AdminRequestMeta } from '../admin-token.service';
import { AdminUserRepository } from '../admin-user.repository';
import type { AdminGoogleProfile } from './admin-google.client';
import { AdminOAuthRepository } from './admin-oauth.repository';

/**
 * 소셜 흐름이 실패한 이유. **콜백은 화면으로 리다이렉트하는 경로라 JSON 오류를 쓸 수 없다** —
 * 이 코드가 쿼리로 실려 가고, 로그인 화면이 문구로 바꾼다.
 */
export type AdminSocialErrorCode =
  /** 구글은 통과했지만 그 이메일의 관리자 계정이 없다. */
  | 'not_registered'
  /** 구글이 검증하지 않은 이메일이다. 이것으로는 계정을 찾아 주지 않는다. */
  | 'email_unverified'
  /** 계정이 비활성이다. */
  | 'disabled'
  /** 그 구글 계정은 이미 다른 관리자에 붙어 있다. */
  | 'link_conflict'
  /** 이 관리자에게 이미 붙어 있다. 바꾸려면 먼저 떼어야 한다. */
  | 'already_linked'
  /** 구글과의 교환이 실패했거나 흐름이 깨졌다. */
  | 'failed';

/** 소셜 흐름의 실패. 컨트롤러가 code 를 쿼리에 실어 로그인 화면으로 돌려보낸다. */
export class AdminSocialError extends Error {
  constructor(readonly code: AdminSocialErrorCode) {
    super(code);
    this.name = 'AdminSocialError';
  }
}

/** 화면에 보여 줄 연동 상태. */
export interface AdminSocialLink {
  readonly provider: `${OAuthProvider}`;
  readonly email: string | null;
  readonly linkedAt: Date;
}

/**
 * 관리자 소셜 로그인·연동.
 *
 * **가입은 하지 않는다.** 관리자 계정은 콘솔과 CLI 로만 만들어지므로, 구글로 들어왔는데
 * 그 이메일의 계정이 없으면 만들지 않고 돌려보낸다 — 구글 계정만 있으면 누구나 관리자가 되는
 * 길을 열 수는 없다.
 *
 * **비밀번호를 대체하지 않는다.** 연동돼 있어도 비밀번호 로그인은 그대로 살아 있고, 연동을
 * 떼어도 로그인 통로가 남는다(admin_user.password 는 NOT NULL 이다).
 */
@Injectable()
export class AdminSocialService {
  constructor(
    private readonly links: AdminOAuthRepository,
    private readonly admins: AdminUserRepository,
    private readonly loginFlow: AdminLoginService,
    private readonly log: AdminActionLogService,
  ) {}

  /**
   * 구글 신원으로 로그인한다.
   *
   * 찾는 순서가 둘인 이유가 있다.
   *  1. 연동 기록(sub) — 이미 붙여 둔 계정이면 이메일이 무엇으로 바뀌었든 그 관리자다.
   *  2. 검증된 이메일 — 처음 들어오는 경우다. 성공하면 그 자리에서 연동을 만들어 두어
   *     다음부터는 1번으로 끝난다.
   */
  async loginWithGoogle(
    profile: AdminGoogleProfile,
    meta: AdminRequestMeta,
  ): Promise<AdminAuthTokens> {
    const linked = await this.links.findByProviderId(OAuthProvider.GOOGLE, profile.providerId);

    if (linked) {
      const known = await this.admins.findById(linked.adminId);
      /*
        **지운 계정을 여기서 막는다.** 계정 삭제는 행을 남기는 소프트 삭제라 연동 기록도
        같이 남는다 — 조회가 살아 있는 계정만 보기 때문에 지운 사람의 구글로는 여기서 끝난다.
        (비밀번호 통로도 같은 규칙이다. AdminUserRepository 주석 참고.)
      */
      if (!known) throw await this.reject(profile, meta, 'not_registered');
      return this.complete(known, meta, false);
    }

    const email = profile.email ? normalizeEmail(profile.email) : '';
    if (!email) {
      throw await this.reject(profile, meta, 'not_registered');
    }
    /*
      **검증되지 않은 이메일로는 계정을 찾아 주지 않는다.** 이 한 줄이 없으면 아무 이메일이나
      적어 둔 구글 계정으로 남의 관리자 자리에 들어올 수 있다 — 이메일을 신뢰한다는 말은
      "구글이 그 주소의 주인임을 확인해 줬다" 는 뜻이지 "구글이 그 문자열을 줬다" 가 아니다.
    */
    if (!profile.emailVerified) {
      throw await this.reject(profile, meta, 'email_unverified');
    }

    const admin = await this.admins.findByEmail(email);
    if (!admin) {
      throw await this.reject(profile, meta, 'not_registered');
    }
    if (admin.status !== AdminStatus.ACTIVE) {
      throw await this.reject(profile, meta, 'disabled', admin.id);
    }

    await this.links.create({
      adminId: admin.id,
      provider: OAuthProvider.GOOGLE,
      providerId: profile.providerId,
      email: profile.email,
    });
    await this.log.record({
      adminId: admin.id,
      email: admin.email,
      action: 'SOCIAL_LINK',
      result: 'SUCCESS',
      ip: meta.ip,
      userAgent: meta.userAgent,
      detail: { provider: 'google', email: profile.email, auto: true },
    });

    return this.complete(admin, meta, true);
  }

  /** 로그인한 관리자에게 구글을 붙인다(마이 페이지). */
  async link(adminId: number, profile: AdminGoogleProfile, meta: AdminRequestMeta): Promise<void> {
    const existing = await this.links.findByProviderId(OAuthProvider.GOOGLE, profile.providerId);
    if (existing) {
      // 같은 계정에 다시 붙이는 것은 실패가 아니다 — 이미 원하는 상태다.
      if (existing.adminId === adminId) return;
      throw new AdminSocialError('link_conflict');
    }
    if (await this.links.findByAdmin(adminId, OAuthProvider.GOOGLE)) {
      // 조용히 갈아 끼우지 않는다. 어느 계정이 붙어 있는지 보고 떼는 것까지 사람이 정한다.
      throw new AdminSocialError('already_linked');
    }

    const admin = await this.admins.findById(adminId);
    if (!admin) {
      throw new AdminSocialError('failed');
    }

    await this.links.create({
      adminId,
      provider: OAuthProvider.GOOGLE,
      providerId: profile.providerId,
      email: profile.email,
    });
    await this.log.record({
      adminId,
      email: admin.email,
      action: 'SOCIAL_LINK',
      result: 'SUCCESS',
      ip: meta.ip,
      userAgent: meta.userAgent,
      detail: { provider: 'google', email: profile.email },
    });
  }

  /**
   * 연동을 뗀다.
   *
   * **막을 이유가 없다.** 비밀번호가 항상 있어서 마지막 로그인 수단이 사라지는 경우가 없다 —
   * 회원 쪽이 "마지막 소셜은 못 뗀다" 를 따지는 것과 갈리는 지점이다.
   *
   * @returns 실제로 뗐는가. 붙어 있지 않았으면 false.
   */
  async unlink(adminId: number, meta: AdminRequestMeta): Promise<boolean> {
    const removed = await this.links.delete(adminId, OAuthProvider.GOOGLE);
    if (removed === 0) return false;

    const admin = await this.admins.findById(adminId);
    await this.log.record({
      adminId,
      email: admin?.email ?? null,
      action: 'SOCIAL_UNLINK',
      result: 'SUCCESS',
      ip: meta.ip,
      userAgent: meta.userAgent,
      detail: { provider: 'google' },
    });
    return true;
  }

  /** 이 관리자에 붙어 있는 연동. 마이 페이지가 그린다. */
  async list(adminId: number): Promise<AdminSocialLink[]> {
    const rows = await this.links.listByAdmin(adminId);
    return rows.map((row) => ({
      provider: row.provider,
      email: row.email,
      linkedAt: row.createdAt,
    }));
  }

  /**
   * 소셜 로그인 실패를 남기고 오류를 만든다.
   *
   * **비밀번호 로그인과 같은 표에 같은 모양으로 쌓는다**(LOGIN·FAIL·failReason). 관리자
   * 로그인은 몇 안 되는 감시 대상이라, 통로가 늘었다고 어느 한쪽만 기록이 없으면 안 된다.
   * 화면에는 코드 하나만 가고, 여기 남는 것이 되짚을 때 볼 전부다.
   */
  private async reject(
    profile: AdminGoogleProfile,
    meta: AdminRequestMeta,
    code: AdminSocialErrorCode,
    adminId?: number,
  ): Promise<AdminSocialError> {
    await this.log.record({
      adminId: adminId ?? null,
      // 계정이 없어 번호가 없을 때 남는 유일한 단서다.
      email: profile.email,
      action: 'LOGIN',
      result: 'FAIL',
      failReason: code,
      ip: meta.ip,
      userAgent: meta.userAgent,
      detail: { via: 'google', providerId: profile.providerId },
    });
    return new AdminSocialError(code);
  }

  /** 로그인 성립 이후는 비밀번호 로그인과 같은 경로를 탄다(세션·마지막 로그인·감사 로그). */
  private async complete(
    admin: { id: number; email: string; mustChangePassword: boolean; status: AdminStatus },
    meta: AdminRequestMeta,
    justLinked: boolean,
  ): Promise<AdminAuthTokens> {
    if (admin.status !== AdminStatus.ACTIVE) {
      throw new AdminSocialError('disabled');
    }
    /*
      **mustChangePassword 를 풀어 주지 않는다.** 구글로 신원이 확인됐어도 남이 정해 준
      비밀번호는 여전히 살아 있다 — 그 값으로 들어올 수 있는 상태를 그대로 두면 안 된다.
    */
    return this.loginFlow.complete(admin, meta, { via: 'google', linked: justLinked });
  }
}
