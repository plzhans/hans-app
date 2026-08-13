/**
 * 관리자 인증 계층. `@hansapp/admin-application/auth` 서브패스로만 노출한다.
 *
 * 패키지 배럴(../index.ts)에 넣지 않는 이유는 admin-auth.module.ts 주석 참고 —
 * 배치·CLI 가 인증 의존성을 지고 뜨지 않게 하려는 것이다.
 */
export { AdminAuthModule } from './admin-auth.module';

export { AdminAuthService } from './admin-auth.service';
// 관리자 계정 관리(콘솔). 조회·등록·삭제만 한다 — 초기화·비활성화는 아직 CLI 뿐이다.
export { AdminAccountService } from './admin-account.service';
export type {
  AdminAccountSummary,
  AdminAccountDetail,
  AdminActor,
  AdminOAuthSummary,
  AdminSessionSummary,
} from './admin-account.service';
/*
  로그인 세션 캐시. **가드가 요청마다 보는 자리라 실제 통과 여부를 정한다** —
  콘솔이 이걸 들여다보고 지운다(기기 목록은 DB 를 보고 그리므로 둘이 어긋날 수 있다).
*/
export { AdminSessionCache } from './admin-session-cache.service';
/* 내 정보(`/api/admins/me`) 응답 캐시. 콘솔의 캐시 탭이 이걸 들여다보고 지운다. */
export { AdminProfileCache } from './admin-profile-cache.service';
export type { AdminProfileCacheState } from './admin-profile-cache.service';
export type { AdminSessionCacheState, CachedAdminSession } from './admin-session-cache.service';
/* 정비 화면의 "관리자 전체 로그아웃". 회원 쪽 SessionPurgeService 와 짝이다. */
export { AdminSessionPurgeService } from './admin-session-purge.service';
export type { AdminSessionPurgeResult } from './admin-session-purge.service';
/* 정비 화면이 일괄 삭제에 쓰는 전역 패턴. 키 형식은 admin-cache-keys 가 갖는다. */
export { ALL_ADMIN_PROFILES_MATCH, ALL_ADMIN_SESSIONS_MATCH } from './admin-cache-keys';
// 로그인 화면의 "비밀번호 찾기". 티켓을 내주고, 그 티켓으로 비밀번호를 다시 세운다.
export { AdminPasswordResetService } from './admin-password-reset.service';
export type {
  AdminPasswordResetTicket,
  AdminPasswordResetTarget,
} from './admin-password-reset.service';
export { AdminTokenService } from './admin-token.service';
export type { AdminAuthTokens, AdminRequestMeta } from './admin-token.service';

// 소셜 로그인(구글). 자격증명은 DB 설정(admin.google.*)에서 오고, 계정은 만들지 않는다.
export { AdminSocialService, AdminSocialError } from './social/admin-social.service';
export type { AdminSocialErrorCode, AdminSocialLink } from './social/admin-social.service';
export { AdminGoogleClient } from './social/admin-google.client';
export type { AdminGoogleProfile } from './social/admin-google.client';
export { AdminSocialTicketService } from './social/admin-social-ticket.service';
export type { AdminOAuthState } from './social/admin-social-ticket.service';

export { AdminActionLogService } from './admin-action-log.service';
export type {
  AdminAction,
  AdminActionResult,
  AdminActionLogInput,
} from './admin-action-log.service';

export { AdminAuthGuard } from './admin-auth.guard';
export { AdminPublic, IS_ADMIN_PUBLIC_KEY } from './admin-public.decorator';
export {
  AllowDuringPasswordChange,
  ALLOW_DURING_PASSWORD_CHANGE_KEY,
} from './allow-password-change.decorator';
export { CurrentAdmin } from './current-admin.decorator';
export type { AdminAuthUser } from './admin-auth-user';

export { ADMIN_AUTH_CONFIG, ADMIN_TOKEN_AUDIENCE, buildAdminAuthConfig } from './admin-auth.config';
export type { AdminAuthConfig, AdminBootstrapConfig } from './admin-auth.config';

// 등급 서열·판정. **정책이라 코드가 갖는다**(DB 에 두면 화면에서 서열을 바꿀 수 있게 된다).
export {
  ADMIN_ROLES,
  ADMIN_ROLE_RANK,
  canManageRole,
  assertCanManageAdmin,
  assertCanAssignRole,
} from './admin-role';

// 관리자 계정 모델·상태 enum 을 여기서 다시 내보낸다.
// 앱·CLI 가 @hansapp/data 를 직접 의존하지 않게 하려는 것이다(기존 계층 규칙과 같다).
export { AdminStatus, AdminRole } from '@hansapp/data';
export type { AdminUser } from '@hansapp/data';
