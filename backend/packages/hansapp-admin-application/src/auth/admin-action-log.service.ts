import { Injectable, Logger } from '@nestjs/common';
import { LogPrisma, PrismaLogService } from '@hansapp/data';
import type { AdminLogAction, AdminLogResult } from '@hansapp/data';

/** 조치 종류. 스키마의 enum 을 그대로 쓴다 — 두 벌로 두면 값이 갈린다. */
export type AdminAction = `${AdminLogAction}`;
export type AdminActionResult = `${AdminLogResult}`;

export interface AdminActionLogInput {
  /** 이 일을 한 관리자. 로그인 실패처럼 계정이 특정되지 않으면 없다. */
  readonly adminId?: number | null;
  /** 그때의 이메일. 계정이 지워지면 번호로는 아무것도 되찾을 수 없어 함께 남긴다. */
  readonly email?: string | null;
  readonly action: AdminAction;
  readonly result: AdminActionResult;
  /** 조치를 당한 관리자. 계정 관리에서만 채운다. */
  readonly targetAdminId?: number | null;
  /** 실패 사유. **로그에만 남긴다** — 응답 메시지는 항상 같아야 한다. */
  readonly failReason?: string | null;
  /**
   * 발급·폐기된 세션 식별자. **숫자로 받아 문자열로 적는다.**
   *
   * 세션 키는 숫자지만 로그 칸은 VarChar 다 — 로그는 오래 남고 형식이 바뀌어도 옛 줄을
   * 고쳐 쓸 수 없어서, 넓은 쪽으로 받아 둔다(회원 인증 로그와 같은 규칙).
   */
  readonly sessionId?: string | number | null;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
  /** 조치별 부가정보. 모양이 액션마다 다르다. */
  readonly detail?: LogPrisma.InputJsonValue | null;
}

/**
 * 관리자 행위 기록. **로그 DB(admin_action_log)에 적재한다.**
 *
 * 로그인·로그아웃·비밀번호 변경 같은 인증 이벤트와, 남의 계정을 만들고 지우고 비밀번호를
 * 다시 내는 관리 조치가 같은 표에 쌓인다 — 되짚을 때 묻는 질문("누가 언제 무엇을")이 같다.
 *
 * **기록 실패가 본 요청을 깨서는 안 된다.** 예외를 삼키고 경고만 남긴다(회원 쪽
 * AuthLogService 와 같은 규칙이다). 로그 DB 와 메인 DB 는 별도 client 라 트랜잭션으로
 * 묶이지 않는다 — 즉 "일은 됐는데 기록만 빠지는" 창이 원래 있다. 그 반대(기록은 남고 일은
 * 안 된 것)보다 낫다고 보고 이 방향을 고른 것이다.
 */
@Injectable()
export class AdminActionLogService {
  private readonly logger = new Logger(AdminActionLogService.name);

  constructor(private readonly prisma: PrismaLogService) {}

  async record(input: AdminActionLogInput): Promise<void> {
    try {
      const data: LogPrisma.AdminActionLogCreateInput = {
        adminId: input.adminId ?? null,
        email: input.email ?? null,
        action: input.action,
        result: input.result,
        targetAdminId: input.targetAdminId ?? null,
        failReason: input.failReason ?? null,
        sessionId: input.sessionId == null ? null : String(input.sessionId),
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      };
      // Json 컬럼은 값이 있을 때만 채운다(없으면 컬럼 기본값 null 유지).
      if (input.detail != null) {
        data.detail = input.detail;
      }
      await this.prisma.adminActionLog.create({ data });
    } catch (error) {
      this.logger.warn(
        `Failed to store admin action log (action=${input.action}): ${String(error)}`,
      );
    }
  }
}
