import { DynamicModule, Module } from '@nestjs/common';
import { ConfigSource } from '@hansapp/common';

import { buildDbConfig, DB_CONFIG } from './db.config';
import { PrismaMigrationService } from './prisma-migration.service';
import { PrismaService } from './prisma.service';
import { PrismaLogService } from './prisma-log.service';

/**
 * 데이터 접근 계층 모듈. DB 별 Prisma 서비스를 제공/노출한다.
 * 스키마·커넥션·Prisma 도구는 이 패키지 안에 캡슐화되고,
 * 응용 계층은 이 모듈만 import 하여 DB 세부를 신경 쓰지 않는다.
 *
 * 설정은 forRoot 로 ConfigSource 를 받아 이 계층이 직접 뽑고 검증한다.
 * 필수 DB 설정이 없으면 모듈을 만드는 시점(부팅)에 즉시 실패한다.
 */
@Module({})
export class DataModule {
  static forRoot(source: ConfigSource): DynamicModule {
    const config = buildDbConfig(source);

    return {
      module: DataModule,
      providers: [
        { provide: DB_CONFIG, useValue: config },
        PrismaService,
        PrismaLogService,
        PrismaMigrationService,
      ],
      exports: [
        DB_CONFIG,
        PrismaService,
        PrismaLogService,
        PrismaMigrationService,
      ],
    };
  }
}
