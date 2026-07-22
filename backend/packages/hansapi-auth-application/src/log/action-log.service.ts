import { Injectable, Logger } from '@nestjs/common';
import {
  ActionResult,
  AuthProvider,
  LogAuthProvider,
  LogPrisma,
  PrismaLogService,
  UserAction,
} from '@hansapi/data';

/** 로그 적재 요청. provider 는 메인 도메인 enum 을 받아 로그 enum 으로 변환한다. */
export interface ActionLogInput {
  userId?: number | null;
  action: UserAction;
  result: ActionResult;
  provider?: AuthProvider | null;
  failReason?: string | null;
  sessionId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  detail?: LogPrisma.InputJsonValue | null;
}

/**
 * 인증 이벤트 로그 서비스. 로그 DB(dev_hansapi_auth_log)에 이벤트를 적재한다.
 *
 * **로깅 실패가 본 요청을 깨서는 안 된다.** 모든 쓰기는 예외를 삼키고 경고만 남긴다.
 * 로그 DB 와 메인 DB 는 분리돼 있어(별도 client) 트랜잭션으로 묶지 않는다.
 */
@Injectable()
export class ActionLogService {
  private readonly logger = new Logger(ActionLogService.name);

  constructor(private readonly prisma: PrismaLogService) {}

  async record(input: ActionLogInput): Promise<void> {
    try {
      const data: LogPrisma.UserActionLogCreateInput = {
        userId: input.userId ?? null,
        action: input.action,
        result: input.result,
        provider: input.provider ? LogAuthProvider[input.provider] : null,
        failReason: input.failReason ?? null,
        sessionId: input.sessionId ?? null,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      };
      // Json 컬럼은 값이 있을 때만 채운다(없으면 컬럼 기본값 null 유지).
      if (input.detail != null) {
        data.detail = input.detail;
      }
      await this.prisma.userActionLog.create({ data });
    } catch (error) {
      this.logger.warn(
        `인증 이벤트 로그 적재 실패(action=${input.action}): ${String(error)}`,
      );
    }
  }
}
