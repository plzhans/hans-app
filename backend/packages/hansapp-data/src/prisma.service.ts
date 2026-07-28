import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '../generated/main';
import { DB_CONFIG, DbConfig } from './db.config';

/**
 * 메인 DB 접근 서비스.
 *
 * 접속 URL 을 설정에서 **명시적으로 주입받는다.** schema.prisma 의 env("DATABASE_URL") 은
 * process.env 를 암묵적으로 읽으므로, 런타임에는 그 고리를 끊고 datasources 로 넘긴다.
 * (prisma CLI 는 별도 프로세스라 여전히 process.env 를 쓴다. hansapp-cli 가 명시적으로 주입한다.)
 *
 * 로그 DB 는 보존기간이 달라 분리돼 있다. PrismaLogService 를 쓴다.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(@Inject(DB_CONFIG) config: DbConfig) {
    super({ datasources: { db: { url: config.url } } });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
