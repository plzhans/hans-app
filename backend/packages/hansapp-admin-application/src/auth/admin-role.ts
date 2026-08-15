import { AdminRole } from '@hansapp/data';
import { Logger } from '@nestjs/common';
import { ForbiddenError } from '@hansapp/common';
import { AdminErrorCode } from '../error';

/**
 * 등급의 서열. **작을수록 높다.**
 *
 * 숫자를 DB 에 두지 않고 코드가 갖는다 — 등급 사이의 순서는 정책이지 데이터가 아니고,
 * 값이 DB 에 있으면 화면에서 서열을 바꿀 수 있게 되어 버린다(그건 권한 체계를 갈아엎는 일이다).
 *
 * 사이에 등급을 끼울 여지를 두려고 10 단위로 뗀다.
 */
export const ADMIN_ROLE_RANK: Record<AdminRole, number> = {
  [AdminRole.SYSTEM]: 10,
  [AdminRole.ADMIN]: 20,
  [AdminRole.OPERATOR]: 30,
};

/** 높은 등급부터. 화면의 선택 목록 차례가 이 순서다. */
export const ADMIN_ROLES: AdminRole[] = [AdminRole.SYSTEM, AdminRole.ADMIN, AdminRole.OPERATOR];

/**
 * `actor` 가 `target` 등급의 계정을 다룰 수 있는가.
 *
 * **자기보다 위는 못 건드린다. 같은 등급은 된다.**
 *
 * 같은 등급을 허용하는 이유는 그러지 않으면 등급마다 한 명씩만 있는 순간
 * (지금 관리자가 두세 명뿐이다) 아무도 서로를 못 고치게 되기 때문이다.
 * 대신 "자기 자신" 에 대한 제약(삭제·비밀번호 초기화 금지)은 등급과 무관하게 따로 있다.
 */
const logger = new Logger('AdminRole');

export function canManageRole(actor: AdminRole, target: AdminRole): boolean {
  return ADMIN_ROLE_RANK[target] >= ADMIN_ROLE_RANK[actor];
}

/**
 * 상급 계정을 건드리려 하면 거절한다.
 *
 * **403 이다.** 인증은 통과했고 자격이 모자란 것이라, 프론트가 401 로 오해해 토큰 갱신을
 * 반복하면 안 된다(가드가 비밀번호 강제 변경을 막을 때와 같은 이유다).
 *
 * @param what 무엇을 하려 했는지(영어 동사구). **응답에는 안 실린다** — 어느 동작을
 *   시도했는지는 우리가 로그에서 볼 값이지, 거절 사유를 나눠 알려 줄 값이 아니다.
 */
export function assertCanManageAdmin(actor: AdminRole, target: AdminRole, what: string): void {
  if (!canManageRole(actor, target)) {
    logger.debug(`Refused to ${what} an admin: actor=${actor} target=${target}`);
    throw new ForbiddenError(AdminErrorCode.ADMIN_ROLE_TOO_HIGH);
  }
}

/** 자기보다 높은 등급을 내주려 하면 거절한다(계정을 만들 때·등급을 바꿀 때). */
export function assertCanAssignRole(actor: AdminRole, role: AdminRole): void {
  if (!canManageRole(actor, role)) {
    throw new ForbiddenError(AdminErrorCode.ADMIN_ROLE_TOO_HIGH, {
      message: 'Cannot assign a role higher than your own.',
    });
  }
}
