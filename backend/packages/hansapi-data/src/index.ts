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
} from '../generated/main';

export { PrismaLogService } from './prisma-log.service';
export { PrismaMigrationService, DB_TARGETS } from './prisma-migration.service';
export type { DbTarget, MigrationOptions } from './prisma-migration.service';
export { DB_CONFIG, buildDbConfig } from './db.config';
export type { DbConfig } from './db.config';
