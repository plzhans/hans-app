import { Injectable } from '@nestjs/common';
import { Page } from '@hansapp/common';
import type { AdminLogAction, AdminLogResult } from '@hansapp/data';

import { AdminActionLogRepository } from './admin-action-log.repository';
import type { AdminActionLogFilter } from './admin-action-log.repository';

/**
 * 기록 한 줄.
 *
 * **id 를 문자열로 바꿔 내보낸다.** DB 는 BigInt 인데 JSON 에는 그 타입이 없어서,
 * 그대로 두면 직렬화에서 터지거나 큰 값이 정밀도를 잃는다.
 */
export interface AdminActionLogEntry {
  readonly id: string;
  /** 이 일을 한 관리자. 로그인 실패면 없다. */
  readonly adminId: number | null;
  /** 그때의 이메일. 계정이 지워진 뒤에는 이 값만 남는다. */
  readonly email: string | null;
  readonly action: AdminLogAction;
  readonly result: AdminLogResult;
  /** 조치를 당한 관리자. 계정 관리에서만 있다. */
  readonly targetAdminId: number | null;
  readonly failReason: string | null;
  readonly ip: string | null;
  readonly userAgent: string | null;
  /** 조치별 부가정보. 모양이 액션마다 달라 타입을 두지 않는다. */
  readonly detail: unknown;
  readonly createdAt: Date;
}

export interface AdminActionLogQuery extends AdminActionLogFilter {
  readonly page: number;
  readonly size: number;
}

/**
 * 관리자 행위 기록 조회.
 *
 * **로그인만이 아니다.** 계정 생성·수정·삭제·비밀번호 초기화가 같은 표에 쌓인다 —
 * 되짚을 때 실제로 묻는 것("누가 이 계정을 지웠나")이 로그인 밖에 있다.
 *
 * **session_id 는 내보내지 않는다.** 화면이 쓸 일이 없는데 유출되면 손해만 난다
 * (회원 기록과 같은 규칙이다).
 */
@Injectable()
export class AdminActionLogReadService {
  constructor(private readonly repo: AdminActionLogRepository) {}

  async list(query: AdminActionLogQuery): Promise<Page<AdminActionLogEntry>> {
    const [rows, total] = await this.repo.listPage(
      {
        adminId: query.adminId,
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
        adminId: row.adminId,
        email: row.email,
        action: row.action,
        result: row.result,
        targetAdminId: row.targetAdminId,
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
