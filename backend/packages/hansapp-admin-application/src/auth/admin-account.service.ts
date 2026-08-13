import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdminRole } from '@hansapp/data';
import type { AdminStatus, AdminUser } from '@hansapp/data';

import { AdminActionLogService } from './admin-action-log.service';
import { AdminAuthService } from './admin-auth.service';
import { isEmailLike, normalizeEmail } from './admin-email';
import { assertCanAssignRole, assertCanManageAdmin } from './admin-role';
import { AdminSessionRepository } from './admin-session.repository';
import { AdminUserRepository } from './admin-user.repository';

/**
 * 이 조치를 한 사람. **누가 했는지 없이는 관리 조치를 받지 않는다.**
 *
 * 접속 정보(ip·userAgent)까지 함께 받는 것은 기록 때문이다 — 계정을 지운 것이 누구인지
 * 되짚을 때 번호만으로는 모자란 순간이 온다(공용 계정, 자리 비운 사이의 조작).
 */
export interface AdminActor {
  readonly adminId: number;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}

/** 목록 한 줄. **비밀번호 해시는 담지 않는다.** */
export interface AdminAccountSummary {
  readonly id: number;
  readonly email: string;
  readonly name: string | null;
  readonly role: AdminRole;
  readonly status: AdminStatus;
  readonly mustChangePassword: boolean;
  readonly language: string;
  readonly timeZone: string;
  readonly lastLoginAt: Date | null;
  readonly createdAt: Date;
}

export interface AdminAccountDetail extends AdminAccountSummary {
  readonly updatedAt: Date;
  /** 살아 있는 로그인 세션 수(만료된 것은 뺀다). */
  readonly activeSessionCount: number;
}

/**
 * 관리자 계정 관리(콘솔).
 *
 * **저장소가 주는 AdminUser 를 그대로 흘려보내지 않는다.** 거기엔 bcrypt 해시가 들어 있어,
 * 엔티티를 그대로 반환하면 컨트롤러가 DTO 로 고르는 것을 한 번만 빠뜨려도 해시가 응답에
 * 실린다 — 회원 조회(UserReadService)와 같은 규칙이다.
 *
 * **계정 비활성화(DISABLED)는 아직 CLI 에만 있다** — 무엇을 어디까지 화면에서 허용할지
 * 정한 뒤에 연다.
 *
 * ---
 *
 * **등급(AdminRole)이 여기서 하는 일은 하나다: 자기보다 높은 등급은 못 건드린다.**
 *
 * 만들기·고치기만이 아니라 **삭제와 비밀번호 초기화에도 같은 규칙을 건다.** 앞의 둘만
 * 막으면 운영자가 시스템 관리자의 비밀번호를 초기화해 그 계정으로 로그인하면 그만이라
 * 규칙이 있으나 마나가 된다. "고칠 수 없다" 는 것은 그 계정을 **가져갈 수 없다** 는 뜻이어야 한다.
 *
 * 등급이 정하는 것은 여기까지다 — 설정·회원·앱 화면은 아직 등급을 보지 않는다.
 */
@Injectable()
export class AdminAccountService {
  constructor(
    private readonly admins: AdminUserRepository,
    private readonly sessions: AdminSessionRepository,
    private readonly auth: AdminAuthService,
    private readonly log: AdminActionLogService,
  ) {}

  /**
   * 전체 목록. **페이징이 없다** — 관리자 계정은 몇 개뿐이라 나눌 것이 없고,
   * 나누면 오히려 "누가 들어올 수 있는가" 를 한 화면에서 못 본다.
   */
  async list(): Promise<AdminAccountSummary[]> {
    const admins = await this.admins.listAll();
    return admins.map(toSummary);
  }

  async findById(id: number): Promise<AdminAccountDetail | null> {
    const admin = await this.admins.findById(id);
    if (!admin) return null;

    return {
      ...toSummary(admin),
      updatedAt: admin.updatedAt,
      activeSessionCount: await this.sessions.countActiveByAdmin(id, new Date()),
    };
  }

  /**
   * 계정을 만든다. 이메일 형식·중복 확인과 해시는 AdminAuthService 가 한다 —
   * CLI 와 콘솔이 같은 규칙(특히 **첫 로그인에서 비밀번호 변경 강제**)을 쓰게 하려는 것이다.
   *
   * **비밀번호를 반드시 받는다.** CLI 는 안 주면 서버가 만들어 터미널에 한 번 찍지만,
   * 콘솔에는 그 자리가 없다 — 화면이 만들어 채워 넣고, 그 값을 아는 채로 보낸다.
   *
   * **등급도 반드시 받는다.** 안 주면 스키마 기본값(SYSTEM)으로 떨어지는데, 콘솔에서
   * 실수로 빠뜨린 요청이 최고 등급을 만들어 버리는 것은 조용한 사고다.
   */
  async create(
    input: {
      email: string;
      name?: string | null;
      role: AdminRole;
      password: string;
    },
    actor: AdminActor,
  ): Promise<AdminAccountSummary> {
    // 자기보다 높은 등급을 만들 수 없다 — 그게 되면 등급을 스스로 올리는 우회로가 된다.
    assertCanAssignRole(await this.roleOf(actor), input.role);

    const { admin } = await this.auth.createAdmin({
      email: input.email,
      name: input.name,
      role: input.role,
      plainPassword: input.password,
    });

    await this.log.record({
      ...meta(actor),
      action: 'ADMIN_CREATE',
      result: 'SUCCESS',
      targetAdminId: admin.id,
      // 계정이 나중에 지워져도 "누구를 무슨 등급으로 만들었는지" 가 남아야 한다.
      detail: { targetEmail: admin.email, role: admin.role },
    });

    return toSummary(admin);
  }

  /**
   * 이메일·표시 이름·등급을 고친다. **보낸 항목만 바뀐다.**
   *
   * **등급은 두 번 본다** — 지금 등급이 나보다 높으면 아예 못 건드리고, 바꾸려는 등급이
   * 나보다 높아도 안 된다. 앞을 빼면 남의 상급 계정을 끌어내릴 수 있고, 뒤를 빼면
   * 자기 자신을 올릴 수 있다.
   *
   * **이메일은 로그인 식별자라 바꾸면 옛 주소로는 못 들어온다.** 그래도 여는 이유는 담당자
   * 주소가 실제로 바뀌기 때문이다(부서 이동·도메인 교체) — 그때 계정을 새로 만들어 옮기면
   * 그 사람이 남긴 기록과의 연결(admin_user.id)이 끊긴다.
   *
   * **세션은 그대로 둔다.** 인증은 번호(sub)로 걸려 있어 주소가 바뀌어도 이어지고,
   * 비밀번호가 샌 것이 아니라 표기가 바뀐 것뿐이라 끊을 이유가 없다.
   *
   * 언어·시간대는 여기서 못 바꾼다 — 그건 본인 화면(`PATCH /auth/me`)의 몫이다.
   */
  async update(
    id: number,
    input: { email?: string; name?: string | null; role?: AdminRole },
    actor: AdminActor,
  ): Promise<AdminAccountDetail> {
    const admin = await this.admins.findById(id);
    if (!admin) {
      throw new NotFoundException(`Admin not found: ${id}`);
    }

    const actorRole = await this.roleOf(actor);
    assertCanManageAdmin(actorRole, admin.role, 'modify');

    const data: { email?: string; name?: string | null; role?: AdminRole } = {};

    if (input.role !== undefined && input.role !== admin.role) {
      assertCanAssignRole(actorRole, input.role);
      /*
        **마지막 시스템 관리자는 등급을 내리지 못한다.** 시스템 관리자를 만들 수 있는 것은
        시스템 관리자뿐이라, 하나 남은 것을 내리면 아무도 그 등급을 되돌릴 수 없다 —
        서버에 들어가 CLI 를 돌리는 것 말고는 길이 없어진다(마지막 계정 삭제를 막는 것과 같은 이유).
      */
      if (
        admin.role === AdminRole.SYSTEM &&
        (await this.admins.countByRole(AdminRole.SYSTEM)) <= 1
      ) {
        throw new BadRequestException(
          'Cannot demote the last system admin — no one could restore that role afterwards.',
        );
      }
      data.role = input.role;
    }

    if (input.email !== undefined) {
      const email = normalizeEmail(input.email);
      if (!isEmailLike(email)) {
        throw new BadRequestException(`Not a valid email address: ${email}`);
      }
      /*
        **대소문자만 다른 값이면 바뀐 것이 아니다.** 정규화한 뒤에 비교해야 자기 자신을
        중복으로 잡지 않는다.
      */
      if (email !== admin.email) {
        const owner = await this.admins.findByEmail(email);
        if (owner) {
          throw new ConflictException('Email already registered.');
        }
        data.email = email;
      }
    }

    if (input.name !== undefined) {
      // 빈 값은 "이름 없음" 이다. 공백만 남기면 목록에서 이름 칸이 빈칸으로 보인다.
      data.name = input.name?.trim() || null;
    }

    // 바뀐 것이 없으면 쓰지 않는다 — updatedAt 만 밀려 "누가 방금 고쳤나" 로 읽힌다.
    if (Object.keys(data).length > 0) {
      await this.admins.updateProfile(id, data);
      await this.log.record({
        ...meta(actor),
        action: 'ADMIN_UPDATE',
        result: 'SUCCESS',
        targetAdminId: id,
        /*
          **바뀐 값을 앞뒤로 남긴다.** 로그인 식별자가 갈렸을 때 "언제부터 이 주소였나" 를
          되짚을 수 있는 곳이 여기뿐이다 — 계정 표에는 지금 값만 있다.
        */
        detail: {
          ...(data.email ? { email: { from: admin.email, to: data.email } } : {}),
          ...(data.name !== undefined ? { name: { from: admin.name, to: data.name } } : {}),
          ...(data.role ? { role: { from: admin.role, to: data.role } } : {}),
        },
      });
    }
    // 세션 수까지 채운 값을 돌려준다 — 화면이 고친 뒤 상세를 다시 묻지 않아도 된다.
    return (await this.findById(id))!;
  }

  /**
   * 비밀번호를 다시 낸다. **현재 비밀번호를 묻지 않는다.**
   *
   * 쓰이는 자리가 "본인이 값을 잃어버렸다" 라서다 — 물어볼 수 있으면 초기화가 필요하지 않다.
   * 그래서 이 경로는 **다른 관리자만** 부를 수 있고(자기 자신은 막는다), 대신 뒤처리가 무겁다:
   *
   *   - 남이 정해 준 값이므로 **첫 로그인에서 변경을 강제**한다.
   *   - **살아 있는 세션을 전부 끊는다.** 초기화하는 이유가 유출일 수도 있는데, 열려 있던
   *     세션을 남겨 두면 비밀번호를 바꾼 의미가 없다.
   *
   * 둘 다 AdminAuthService.resetPassword 가 한 번에 한다 — CLI 와 같은 규칙을 쓰려고 그쪽을 부른다.
   *
   * **자기 자신은 막는다.** 본인 것을 여기서 초기화하면 그 자리에서 세션이 끊겨 콘솔 밖으로
   * 튕기고, 정작 본인이 값을 아는 상황에서는 비밀번호 변경 화면이 맞는 통로다.
   */
  async resetPassword(
    id: number,
    actor: AdminActor,
    password: string,
  ): Promise<AdminAccountSummary> {
    const admin = await this.admins.findById(id);
    if (!admin) {
      throw new NotFoundException(`Admin not found: ${id}`);
    }
    if (id === actor.adminId) {
      throw new BadRequestException('Use the password change flow for your own account.');
    }
    /*
      **초기화도 등급을 본다.** 이걸 빼면 상급 계정의 비밀번호를 다시 내고 그 값으로
      로그인하면 그만이라, "고칠 수 없다" 는 규칙이 통째로 무의미해진다.
    */
    assertCanManageAdmin(await this.roleOf(actor), admin.role, 'reset the password of');

    const { admin: updated } = await this.auth.resetPassword(admin.email, password);

    await this.log.record({
      ...meta(actor),
      action: 'ADMIN_PASSWORD_RESET',
      result: 'SUCCESS',
      targetAdminId: id,
      detail: { targetEmail: admin.email },
    });

    return toSummary(updated);
  }

  /**
   * 계정을 지운다. 세션은 FK Cascade 로 함께 사라진다.
   *
   * **자기 자신은 못 지운다.** 실수로 지우면 그 자리에서 콘솔 밖으로 튕기고, 남은 관리자가
   * 없으면 서버에 들어가 CLI 를 돌려야 풀린다. 되돌릴 수 없는 조작이라 화면 확인만으로는 모자라다.
   *
   * 마지막 계정을 따로 막는 것은 위 규칙만으로는 뚫리는 창이 있어서다 — 방금 지워진 관리자의
   * access token 은 만료(5분)까지 살아 있고, 그 토큰으로 남은 한 명을 지우면 아무도 못 들어온다.
   */
  async remove(id: number, actor: AdminActor): Promise<void> {
    const admin = await this.admins.findById(id);
    if (!admin) {
      throw new NotFoundException(`Admin not found: ${id}`);
    }
    if (id === actor.adminId) {
      throw new BadRequestException('You cannot delete your own account.');
    }
    // 지우는 것은 고치는 것보다 무거운 조작이다. 등급 규칙이 여기서 느슨할 이유가 없다.
    assertCanManageAdmin(await this.roleOf(actor), admin.role, 'delete');
    if ((await this.admins.count()) <= 1) {
      throw new BadRequestException(
        'Cannot remove the last admin account — no one could sign in afterwards.',
      );
    }
    // 마지막 시스템 관리자가 사라지면 그 등급을 되돌릴 사람이 없다(등급 강등과 같은 이유).
    if (admin.role === AdminRole.SYSTEM && (await this.admins.countByRole(AdminRole.SYSTEM)) <= 1) {
      throw new BadRequestException(
        'Cannot remove the last system admin — no one could restore that role afterwards.',
      );
    }
    await this.admins.delete(id);

    /*
      **지운 계정의 이메일을 detail 에 남긴다.** 이 기록만이 그 번호가 누구였는지 아는
      마지막 자리다 — 계정 표에서는 사라졌고, 로그 DB 는 메인 DB 와 조인할 수도 없다.
    */
    await this.log.record({
      ...meta(actor),
      action: 'ADMIN_DELETE',
      result: 'SUCCESS',
      targetAdminId: id,
      detail: {
        targetEmail: admin.email,
        targetName: admin.name,
        role: admin.role,
      },
    });
  }

  /**
   * 조치를 하는 사람의 등급.
   *
   * **토큰이 아니라 DB 에서 읽는다.** access token 에 실어 두면 등급을 내려도 그 토큰이
   * 만료될 때까지(최대 5분) 옛 등급으로 통한다 — 등급을 내리는 이유가 대개 급한 일이라
   * 그 5분을 열어 둘 이유가 없다. 조치 한 번에 조회 한 번이고, 잦은 경로가 아니다.
   */
  private async roleOf(actor: AdminActor): Promise<AdminRole> {
    const me = await this.admins.findById(actor.adminId);
    if (!me) {
      // 토큰은 유효한데 계정이 사라졌다. 방금 지워진 관리자의 토큰이 살아 있는 경우다.
      throw new NotFoundException('Admin not found.');
    }
    return me.role;
  }
}

/**
 * 로그에 실을 "누가·어디서".
 *
 * **조치가 성공한 뒤에만 남긴다.** 실패는 대부분 입력이 틀린 것(중복 이메일, 마지막 계정
 * 삭제 시도)이라 되짚을 값이 없다 — 무차별 대입이 의미를 갖는 로그인과는 다르다.
 */
function meta(actor: AdminActor) {
  return {
    adminId: actor.adminId,
    ip: actor.ip,
    userAgent: actor.userAgent,
  };
}

function toSummary(admin: AdminUser): AdminAccountSummary {
  return {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
    status: admin.status,
    mustChangePassword: admin.mustChangePassword,
    language: admin.language,
    timeZone: admin.timeZone,
    lastLoginAt: admin.lastLoginAt,
    createdAt: admin.createdAt,
  };
}
