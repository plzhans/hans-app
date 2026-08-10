import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AppStatus } from '@hansapp/data';

import { AccessCacheInvalidator } from './access-cache-invalidator';
import { AppModerationRepository } from './app-moderation.repository';

/** 거절 사유 길이 상한. app.rejection_reason 컬럼(VARCHAR 500)에 맞춘다. */
export const REJECTION_REASON_MAX_LENGTH = 500;

/**
 * 앱 관리 조치 — 심사(승인·거절)와 제재(차단·해제).
 *
 * **운영자 행위다** — 소유자 검증(멤버십)을 하지 않는다. 이 서비스에 닿는 통로는 관리자
 * 인증을 통과한 관리자 API 뿐이고, 그것이 게이트 역할을 한다.
 *
 * 심사 세부 상태는 세 값의 조합이다(app.prisma 주석 참고).
 *   PENDING + reviewRequestedAt 없음 → 작성 중
 *   PENDING + reviewRequestedAt 있음 → 심사 중
 *   PENDING + rejectionReason 있음   → 거절됨
 *   ACTIVE                            → 승인됨
 *   DISABLED                          → 차단(또는 사용자가 끔·삭제)
 *
 * **상태를 바꿀 때는 하위 키·클라이언트도 함께 옮긴다.** 인증이 보는 것은 앱이 아니라
 * 키·클라이언트의 status 라서, 앱만 바꾸면 실제 접근은 아무것도 달라지지 않는다.
 */
@Injectable()
export class AppModerationService {
  private readonly logger = new Logger(AppModerationService.name);

  constructor(
    private readonly repo: AppModerationRepository,
    private readonly cache: AccessCacheInvalidator,
  ) {}

  /**
   * 승인. 앱과 그 하위 PENDING 키·클라이언트를 ACTIVE 로 올린다.
   *
   * **이미 승인된 앱은 그냥 통과시킨다**(멱등) — 목록을 두 창에서 열어 두 번 눌렀을 때
   * 두 번째가 에러로 보이면 승인이 안 된 줄 알고 다시 찾게 된다.
   *
   * 심사 요청을 안 한 앱(작성 중)도 승인할 수 있다. 운영자가 먼저 켜 줘야 하는 일이 있고,
   * CLI(`hansapp-cli app approve`)가 이미 그렇게 동작한다.
   */
  async approve(appId: number, adminId: number): Promise<void> {
    const app = await this.live(appId);
    if (app.status === AppStatus.ACTIVE) {
      return;
    }
    if (app.status === AppStatus.DISABLED) {
      // 차단을 푸는 것은 승인이 아니다 — 되살릴 대상(어디까지 켤지)이 다르다.
      throw new BadRequestException(
        'A blocked app cannot be approved. Unblock it instead.',
      );
    }

    await this.move(appId, [AppStatus.PENDING], () => this.repo.approve(appId));
    this.logger.log(`앱 승인: appId=${appId} adminId=${adminId}`);
  }

  /**
   * 거절. 사유를 남기고 status 는 PENDING 그대로 둔다 — 사용자가 고쳐 재요청한다.
   * 재요청이 들어오면 사유가 지워지고 다시 '심사 중' 이 된다(사용자 쪽 통로가 한다).
   */
  async reject(appId: number, reason: string, adminId: number): Promise<void> {
    const trimmed = reason.trim();
    if (!trimmed) {
      throw new BadRequestException('Rejection reason is required.');
    }
    if (trimmed.length > REJECTION_REASON_MAX_LENGTH) {
      throw new BadRequestException(
        `Rejection reason must be ${REJECTION_REASON_MAX_LENGTH} characters or fewer.`,
      );
    }

    const app = await this.live(appId);
    if (app.status !== AppStatus.PENDING) {
      // 승인된 앱을 거절로 되돌리는 것은 심사가 아니라 제재다 — 차단이 그 통로다.
      throw new BadRequestException(
        'Only a pending app can be rejected. Block it instead.',
      );
    }

    await this.repo.reject(appId, trimmed);
    this.logger.log(`앱 거절: appId=${appId} adminId=${adminId}`);
  }

  /**
   * 차단. 앱과 살아 있는 키·클라이언트를 전부 DISABLED 로 내린다 — 이 앱의 API 호출이
   * 곧바로 거부된다.
   *
   * **삭제가 아니다.** 행은 그대로 남고 해제하면 되돌아간다. 지우는 것은 소유자의 몫이다.
   */
  async block(appId: number, adminId: number): Promise<void> {
    const app = await this.live(appId);
    if (app.status === AppStatus.DISABLED) {
      return; // 이미 꺼져 있다 — 멱등.
    }

    await this.move(appId, [AppStatus.PENDING, AppStatus.ACTIVE], () =>
      this.repo.block(appId),
    );
    this.logger.log(`앱 차단: appId=${appId} adminId=${adminId}`);
  }

  /**
   * 차단 해제. 앱과 그 하위 DISABLED 키·클라이언트를 ACTIVE 로 되돌린다.
   *
   * **차단 이전 상태를 기억해 두지 않는다** — 되돌리면 전부 ACTIVE 다. 지금은 사용자가
   * 키를 개별로 끄는 통로가 없어서 잃을 상태가 없다. 그 기능이 생기면 차단 시점의 상태를
   * 남겨야 한다(그때는 컬럼이 필요하다).
   */
  async unblock(appId: number, adminId: number): Promise<void> {
    const app = await this.live(appId);
    if (app.status !== AppStatus.DISABLED) {
      throw new BadRequestException('Only a blocked app can be unblocked.');
    }

    await this.move(appId, [AppStatus.DISABLED], () =>
      this.repo.unblock(appId),
    );
    this.logger.log(`앱 차단 해제: appId=${appId} adminId=${adminId}`);
  }

  /** 조치 대상 앱. 없거나 삭제됐으면 404 — 지워진 앱은 손댈 대상이 아니다. */
  private async live(appId: number) {
    const app = await this.repo.findLive(appId);
    if (!app) {
      throw new NotFoundException(`App not found: ${appId}`);
    }
    return app;
  }

  /**
   * 상태를 옮기고 인증 캐시를 맞춘다.
   *
   * **움직일 대상을 먼저 읽는다** — 조치 후에는 전부 같은 상태라 이번에 무엇이 바뀌었는지
   * 가려낼 수 없고, 안 바뀐 것까지 캐시를 지우면 불필요한 DB 재조회가 생긴다.
   */
  private async move(
    appId: number,
    from: AppStatus[],
    apply: () => Promise<void>,
  ): Promise<void> {
    const issued = await this.repo.findIssued(appId, from);
    await apply();
    await this.cache.invalidate(appId, issued);
  }
}
