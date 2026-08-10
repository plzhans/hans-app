import { Injectable, Logger } from '@nestjs/common';

export type AdminAction = 'LOGIN' | 'LOGOUT' | 'PASSWORD_CHANGE';
export type AdminActionResult = 'SUCCESS' | 'FAIL';

export interface AdminActionLogInput {
  readonly adminId?: number | null;
  readonly email?: string | null;
  readonly action: AdminAction;
  readonly result: AdminActionResult;
  /** 실패 사유. **로그에만 남긴다** — 응답 메시지는 항상 같아야 한다. */
  readonly failReason?: string | null;
  readonly sessionId?: string | null;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
}

/**
 * 관리자 인증 이벤트 기록.
 *
 * **지금은 애플리케이션 로그로만 남긴다.** 로그 DB 의 user_auth_log 는 userId 가 메인 DB 의
 * user.id 를 가리키는 값이라, 거기에 admin_user.id 를 넣으면 `userId=1` 이 회원인지 관리자인지
 * 구분이 사라진다. 전용 테이블(prisma/log/admin.prisma)이 필요한데 로그 DB 는 마이그레이션
 * 절차가 따로라(`db migrate --db log`) 이번 범위 밖이다.
 *
 * **인터페이스와 호출 지점은 지금 확정해 둔다** — 나중에 이 클래스 안쪽만 Prisma 로 바꾸면
 * 부르는 쪽은 손대지 않는다.
 *
 * 어느 구현이든 **기록 실패가 본 요청을 깨서는 안 된다.**
 */
@Injectable()
export class AdminActionLogService {
  private readonly logger = new Logger('AdminAction');

  record(input: AdminActionLogInput): Promise<void> {
    try {
      const line = [
        `action=${input.action}`,
        `result=${input.result}`,
        `adminId=${input.adminId ?? '-'}`,
        `email=${input.email ?? '-'}`,
        `sid=${input.sessionId ?? '-'}`,
        `ip=${input.ip ?? '-'}`,
        ...(input.failReason ? [`reason=${input.failReason}`] : []),
      ].join(' ');

      if (input.result === 'FAIL') {
        this.logger.warn(line);
      } else {
        this.logger.log(line);
      }
    } catch (error) {
      this.logger.warn(`관리자 인증 이벤트 로그 실패: ${String(error)}`);
    }
    return Promise.resolve();
  }
}
