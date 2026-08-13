import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../generated/log';
import { DB_CONFIG, DbConfig } from './db.config';

/**
 * 로그 DB 접근 서비스.
 *
 * 메인 DB 와 보존기간·관리 주기가 달라 DB 자체를 분리했다.
 * Prisma 는 스키마 하나당 DB 하나만 다루므로 클라이언트도 따로 생성된다.
 * 두 DB 에 걸친 relation 은 만들 수 없다. 조인이 필요하면 raw SQL 을 쓴다(같은 MySQL 서버).
 *
 * 파티셔닝·보관·파기 같은 물리 설계는 DBA 가 별도로 관리한다.
 */
@Injectable()
export class PrismaLogService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(DB_CONFIG) config: DbConfig) {
    super({ datasources: { db: { url: config.logUrl } } });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
