import { BadRequestException, Injectable } from '@nestjs/common';
import { Page } from '@hansapp/common';
import type { AuthLogAction, AuthLogResult } from '@hansapp/data';

import { UserReadRepository } from '../user/user-read.repository';
import { AuthLogRepository } from './auth-log.repository';
import type { AuthLogFilter } from './auth-log.repository';

/**
 * 인증 기록 한 줄.
 *
 * `userEmail` 은 표에 없는 값이다 — 로그 DB 에 회원번호만 있어서, 한 페이지를 읽은 뒤
 * 메인 DB 에 되물어 붙인다. 탈퇴로 이미 지워진 회원이면 번호만 남고 null 이다.
 */
export interface AuthLogEntry {
  readonly id: string;
  readonly userId: number | null;
  readonly userEmail: string | null;
  readonly action: AuthLogAction;
  readonly result: AuthLogResult;
  readonly provider: string | null;
  readonly failReason: string | null;
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly detail: unknown;
  readonly createdAt: Date;
}

export interface AuthLogQuery extends Omit<AuthLogFilter, 'userId'> {
  readonly page: number;
  readonly size: number;
  readonly userId?: number;
  /** 이메일로 찾을 때. 서버가 회원번호로 바꿔서 조회한다. */
  readonly userEmail?: string;
}

/**
 * 전역 인증 기록 조회.
 *
 * **회원 상세의 탭과 답하는 질문이 다르다.** 거기는 "이 사람이 뭘 했나" 이고, 여기는
 * "지금 무슨 일이 벌어지나" 다 — 실패가 몰리는지, 한 IP 가 여러 계정을 두드리는지,
 * 없는 계정으로 시도가 오는지. 마지막 것은 **여기서만 보인다**(user_id 가 null 이라
 * 어느 회원에도 안 붙는다).
 */
@Injectable()
export class AuthLogService {
  constructor(
    private readonly repo: AuthLogRepository,
    private readonly users: UserReadRepository,
  ) {}

  async list(query: AuthLogQuery): Promise<Page<AuthLogEntry>> {
    /*
      **기간을 강제한다.** 대상을 안 가리는 조회라 `(created_at)` 인덱스가 유일한 버팀목이고,
      기간이 없으면 표를 통째로 읽는다. 회원 한 명이면 상세 탭이 `(user_id, created_at)` 으로
      더 잘 답하므로, 여기서 기간을 빼 주는 예외를 만들 이유도 없다.
    */
    if (!query.from) {
      throw new BadRequestException('A start time (from) is required.');
    }

    /*
      이메일은 조회 전에 번호로 바꾼다. **없는 이메일이면 빈 결과다** — 회원이 없다고
      404 를 주면 "그 이메일로 아무 기록도 없다" 와 "그런 회원이 없다" 가 화면에서 갈리는데,
      관리자에게는 둘 다 "찾는 게 없다" 로 같다.
    */
    let userId = query.userId;
    if (userId === undefined && query.userEmail) {
      const found = await this.users.findIdByEmail(query.userEmail.trim().toLowerCase());
      if (found === null) {
        return new Page([], query.page, query.size, 0);
      }
      userId = found;
    }

    const [rows, total] = await this.repo.listPage(
      {
        from: query.from,
        to: query.to,
        actions: query.actions,
        result: query.result,
        ip: query.ip,
        userId,
        anonymousOnly: query.anonymousOnly,
      },
      (query.page - 1) * query.size,
      query.size,
    );

    /*
      **번호를 모아 한 번에 되묻는다.** 로그 DB 와 메인 DB 가 갈려 있어 조인이 안 되므로,
      줄마다 조회하면 페이지 크기만큼 쿼리가 나간다. 이 페이지에 나온 번호만 추려
      쿼리 하나로 끝낸다.
    */
    const ids = [
      ...new Set(rows.map((row) => row.userId).filter((id): id is number => id !== null)),
    ];
    const users = await this.users.findEmailsByIds(ids);
    const emails = new Map(users.map((user) => [user.id, user.email]));

    return new Page(
      rows.map((row) => ({
        id: row.id.toString(),
        userId: row.userId,
        userEmail: row.userId !== null ? (emails.get(row.userId) ?? null) : null,
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
