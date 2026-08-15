import { Injectable, Logger } from '@nestjs/common';
import {
  AuthLogResult,
  AuthProvider,
  LogAuthProvider,
  LogPrisma,
  PrismaLogService,
  AuthLogAction,
} from '@hansapp/data';

/** 로그 적재 요청. provider 는 메인 도메인 enum 을 받아 로그 enum 으로 변환한다. */
export interface AuthLogInput {
  userId?: number | null;
  action: AuthLogAction;
  result: AuthLogResult;
  provider?: AuthProvider | null;
  failReason?: string | null;
  /**
   * 이 일이 일어난 세션. **숫자를 받아 문자열로 남긴다** — 로그 테이블은 별도 DB 라
   * 회원 DB 의 타입 변경에 끌려다니지 않게 문자열 칸 그대로 둔다.
   */
  sessionId?: string | number | null;
  ip?: string | null;
  userAgent?: string | null;
  detail?: LogPrisma.InputJsonValue | null;
}

/**
 * 인증 이벤트 로그 서비스. 로그 DB에 이벤트를 적재한다.
 *
 * **로깅 실패가 본 요청을 깨서는 안 된다.** 모든 쓰기는 예외를 삼키고 경고만 남긴다.
 * 로그 DB 와 메인 DB 는 분리돼 있어(별도 client) 트랜잭션으로 묶지 않는다.
 */
@Injectable()
export class AuthLogService {
  private readonly logger = new Logger(AuthLogService.name);

  constructor(private readonly prisma: PrismaLogService) {}

  async record(input: AuthLogInput): Promise<void> {
    try {
      const data: LogPrisma.UserAuthLogCreateInput = {
        userId: input.userId ?? null,
        action: input.action,
        result: input.result,
        provider: input.provider ? LogAuthProvider[input.provider] : null,
        failReason: input.failReason ?? null,
        sessionId: input.sessionId == null ? null : String(input.sessionId),
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      };
      // Json 컬럼은 값이 있을 때만 채운다(없으면 컬럼 기본값 null 유지).
      if (input.detail != null) {
        data.detail = input.detail;
      }
      await this.prisma.userAuthLog.create({ data });
    } catch (error) {
      this.logger.warn(`Failed to store auth event log (action=${input.action}): ${String(error)}`);
    }
  }
}
