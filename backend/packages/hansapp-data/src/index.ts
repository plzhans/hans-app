export { DataModule } from './data.module';
export { PrismaService } from './prisma.service';

// Prisma 네임스페이스(Prisma.sql, Prisma.join, Prisma.Sql …)는 여기서만 내보낸다.
//
// '@prisma/client' 에서 직접 가져오면 안 된다. 이 프로젝트는 스키마가 둘(main·log)이라
// 클라이언트를 커스텀 경로(generated/main, generated/log)로 생성한다. 그래서
// '@prisma/client' 의 기본 진입점은 아무것도 생성되지 않은 빈 껍데기이고, Prisma.sql 도 없다.
// 개발 머신에서는 예전 생성물이 node_modules/.prisma/client 에 남아 우연히 통과하지만,
// 깨끗한 설치(=CI)에서는 그대로 터진다.
export { Prisma } from '../generated/main';

// Prisma 가 스키마에서 생성한 모델 타입(= 이 프로젝트의 영속성 엔티티). 리포지토리가
// 반환 타입으로 쓴다. Prisma 네임스페이스와 같은 이유로 generated 직접 import 는 금지이며,
// 필요한 모델만 여기서 골라 내보낸다.
export type {
  HiraRegion,
  HiraCode,
  HiraHospital,
  HiraHospitalNpay,
  HiraHospitalDetail,
  HiraHospitalSubject,
  HiraHospitalAsm,
  HealthcareHospital,
  HealthcareHospitalI18n,
  HealthcareHospitalHours,
  HealthcareHospitalStaff,
  HealthcareHospitalBed,
  NmcCode,
  NmcRegion,
  NmcHospital,
  NmcBabyHospital,
  NmcHospitalSubject,
  JobQueue,
  SyncState,
  // 인증(auth.prisma) 도메인 모델
  User,
  UserOAuth,
  UserConsent,
  UserTokenSession,
  UserAuthCode,
  UserWithdrawal,
  EmailVerification,
  // 관리자(admin.prisma) 도메인 모델. 회원(User)과 계정도 세션도 갈라져 있다.
  AdminUser,
  AdminTokenSession,
  // 개발자 플랫폼(app.prisma) 도메인 모델
  App,
  AppMember,
  AppApiKey,
  AppClient,
  // AI(ai.prisma) 도메인 모델
  AppLlmKey,
  // 운영 환경(env_*) 테이블. 서비스 데이터가 아니라 서버 운영을 다루는 모델이다.
  EnvSwaggerAllowedIp,
  EnvSetting,
} from '../generated/main';

// 인증 도메인 enum(값으로도 쓰므로 type-only 가 아니다).
export {
  UserStatus,
  UserRole,
  UserTier,
  AppRole,
  AppStatus,
  AppClientType,
  AuthProvider,
  OAuthProvider,
  ConsentType,
  EmailVerifyPurpose,
  AdminStatus,
} from '../generated/main';

// AI 도메인 enum(값으로도 쓴다).
export { LlmProvider, LlmKeyVerifyState } from '../generated/main';

// 로그 DB(log 스키마) 인증 이벤트 로그. Prisma 네임스페이스도 별도 export
// (main 과 log 는 다른 client 라 Create 입력 타입 등이 서로 다르다).
export type { UserActionLog } from '../generated/log';
export { Prisma as LogPrisma } from '../generated/log';
export {
  UserAction,
  ActionResult,
  AuthProvider as LogAuthProvider,
} from '../generated/log';

export { PrismaLogService } from './prisma-log.service';
export { PrismaMigrationService, DB_TARGETS } from './prisma-migration.service';
export type { DbTarget, MigrationOptions } from './prisma-migration.service';
export { DB_CONFIG, buildDbConfig } from './db.config';
export type { DbConfig } from './db.config';

/*
  서비스 설정(env_setting) 저장소. **테이블 하나짜리 리포지토리를 이 패키지에 두는 예외다** —
  계층마다 달라질 조회 조건이 없어서, 응용 계층마다 같은 코드를 두는 것보다 낫다.
  **읽기 전용이다** — 쓰기는 관리자 계층이 따로 갖는다(SettingWriteRepository).
  자세한 판단은 data.module.ts 주석 참고.
*/
export { SettingReadRepository } from './setting.repository';
