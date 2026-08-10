/**
 * 관리자 인증 계층. `@hansapp/admin-application/auth` 서브패스로만 노출한다.
 *
 * 패키지 배럴(../index.ts)에 넣지 않는 이유는 admin-auth.module.ts 주석 참고 —
 * 배치·CLI 가 인증 의존성을 지고 뜨지 않게 하려는 것이다.
 */
export { AdminAuthModule } from './admin-auth.module';

export { AdminAuthService } from './admin-auth.service';
export { AdminTokenService } from './admin-token.service';
export type { AdminAuthTokens, AdminRequestMeta } from './admin-token.service';

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

export {
  ADMIN_AUTH_CONFIG,
  ADMIN_TOKEN_AUDIENCE,
  buildAdminAuthConfig,
} from './admin-auth.config';
export type {
  AdminAuthConfig,
  AdminBootstrapConfig,
} from './admin-auth.config';

// 관리자 계정 모델·상태 enum 을 여기서 다시 내보낸다.
// 앱·CLI 가 @hansapp/data 를 직접 의존하지 않게 하려는 것이다(기존 계층 규칙과 같다).
export { AdminStatus } from '@hansapp/data';
export type { AdminUser } from '@hansapp/data';
