import { Injectable } from '@nestjs/common';
import { Page } from '@hansapp/common';
import type { AuthLogResult, AuthLogAction } from '@hansapp/data';

import { UserAuthLogRepository } from './user-auth-log.repository';
import type { UserAuthLogFilter } from './user-auth-log.repository';

/**
 * 활동 기록 한 줄.
 *
 * **id 를 문자열로 바꿔 내보낸다.** DB 는 BigInt 인데 JSON 에는 그 타입이 없어서,
 * 그대로 두면 직렬화에서 터지거나 큰 값이 정밀도를 잃는다.
 */
export interface UserAuthLogEntry {
  readonly id: string;
  readonly action: AuthLogAction;
  readonly result: AuthLogResult;
  readonly provider: string | null;
  /** 실패 사유(간단 코드/메시지). 성공이면 null. */
  readonly failReason: string | null;
  readonly ip: string | null;
  readonly userAgent: string | null;
  /**
   * 액션별 부가정보. **모양이 액션마다 달라 타입을 두지 않는다** —
   * 화면은 해석하지 않고 그대로 펼쳐 보여 준다.
   */
  readonly detail: unknown;
  readonly createdAt: Date;
}

export interface UserAuthLogQuery extends UserAuthLogFilter {
  readonly page: number;
  readonly size: number;
}

/**
 * 관리자용 회원 활동 기록 조회.
 *
 * **로그인만이 아니다.** 가입·비밀번호 변경·재설정·소셜 연동/해제·탈퇴가 같은 표에 쌓인다 —
 * 문의 대응에서 실제로 묻는 것("비밀번호 언제 바꿨죠?")이 로그인 밖에 있는 경우가 많다.
 * 그래서 화면이 액션을 골라 거르게 두고, 서버는 특정 액션으로 좁히지 않는다.
 *
 * **session_id 는 내보내지 않는다.** 화면이 쓸 일이 없는데 유출되면 손해만 난다.
 *
 * detail 은 그대로 내보낸다. 액션마다 모양이 달라 화면이 필드를 읽을 계약은 없지만,
 * 관리자가 **펼쳐서 눈으로 보는** 용도라 해석할 필요가 없다.
 */
@Injectable()
export class UserAuthLogService {
  constructor(private readonly repo: UserAuthLogRepository) {}

  async list(query: UserAuthLogQuery): Promise<Page<UserAuthLogEntry>> {
    const [rows, total] = await this.repo.listPage(
      {
        userId: query.userId,
        from: query.from,
        to: query.to,
        actions: query.actions,
      },
      (query.page - 1) * query.size,
      query.size,
    );

    return new Page(
      rows.map((row) => ({
        id: row.id.toString(),
        action: row.action,
        result: row.result,
        provider: row.provider,
        failReason: row.failReason,
        ip: row.ip,
        userAgent: row.userAgent,
        detail: row.detail,
        createdAt: row.createdAt,
      })),
      query.page,
      query.size,
      total,
    );
  }
}
