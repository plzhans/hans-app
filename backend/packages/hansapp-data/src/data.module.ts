import { DynamicModule, Module } from '@nestjs/common';
import { ConfigSource } from '@hansapp/common';

import { buildDbConfig, DB_CONFIG } from './db.config';
import { PrismaMigrationService } from './prisma-migration.service';
import { PrismaService } from './prisma.service';
import { PrismaLogService } from './prisma-log.service';
import { SettingReadRepository } from './setting.repository';
import { EnvLlmKeyReadRepository } from './env-llm-key.repository';
import { EnvLlmModelReadRepository } from './env-llm-model.repository';

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
        /*
          **테이블 하나짜리 리포지토리를 여기 두는 것은 예외다.**

          이 저장소의 관례는 리포지토리를 쓰는 서비스 옆(응용 계층)에 두는 것이다. env_setting 만
          여기 있는 이유는 **계층마다 달라질 조회 조건이 없어서다** — 전건 조회·키 upsert·키 삭제가
          전부이고, 관리자도 메일도 같은 세 가지를 부른다. 계층마다 같은 코드를 세 벌 두는 것이
          이 예외보다 나쁘다.

          조건이 갈리기 시작하면(권한별 필터 등) 그때는 이 예외가 깨진 것이니 응용 계층으로 내린다.

          **읽기만 둔다.** 쓰기까지 여기 있으면 읽기만 하면 되는 계층에서 설정을 덮을 수 있다.
        */
        SettingReadRepository,
        EnvLlmKeyReadRepository,
        EnvLlmModelReadRepository,
      ],
      exports: [
        DB_CONFIG,
        PrismaService,
        PrismaLogService,
        PrismaMigrationService,
        SettingReadRepository,
        EnvLlmKeyReadRepository,
        EnvLlmModelReadRepository,
      ],
    };
  }
}
