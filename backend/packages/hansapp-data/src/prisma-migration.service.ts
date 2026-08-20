import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';

import { DB_CONFIG, DbConfig } from './db.config';

/** 관리 대상 DB. 보존기간·관리 주기가 달라 메인과 로그를 별도 DB 로 분리했다. */
export const DB_TARGETS = ['main', 'log'] as const;
export type DbTarget = (typeof DB_TARGETS)[number];

export interface MigrationOptions {
  /** 마이그레이션 이름. 생략하면 prisma 가 프롬프트로 묻는다. */
  name?: string;
}

/**
 * Prisma 마이그레이션 실행. 스키마 파일과 prisma 실행 파일을 이 패키지가 소유하므로
 * 실행 방법도 여기서 안다. 호출부(CLI)는 무엇을 할지만 정하고 어떻게 하는지는 모른다.
 *
 * prisma 는 별도 프로세스로 뜨며 설정을 process.env 로만 받는다(schema.prisma 의 env(...)).
 * 그래서 부모 환경을 통째로 물려주는 대신 DbConfig 에서 꺼내 명시적으로 주입한다.
 */
@Injectable()
export class PrismaMigrationService {
  /** 이 패키지의 루트. dist/src 어느 쪽에서 실행되든 한 단계 위가 패키지 루트다. */
  private readonly packageDir = resolve(__dirname, '..');

  constructor(@Inject(DB_CONFIG) private readonly config: DbConfig) {}

  /** 스키마 변경분으로 마이그레이션을 만들고 적용한다. 개발용. shadow DB 가 필요하다. */
  migrate(target: DbTarget, options: MigrationOptions = {}): void {
    this.run(target, ['migrate', 'dev', ...(options.name ? ['--name', options.name] : [])]);
  }

  /**
   * 이미 만들어진 마이그레이션을 적용한다. SQL 을 생성하지 않고 데이터도 지우지 않는다.
   * shadow DB 가 필요 없어 운영에서도 안전하다.
   */
  deploy(target: DbTarget): void {
    this.run(target, ['migrate', 'deploy']);
  }

  /** 마이그레이션 적용 상태를 확인한다. */
  status(target: DbTarget): void {
    this.run(target, ['migrate', 'status']);
  }

  /**
   * **마이그레이션만으로 스키마가 그대로 재현되는지** 본다. 차이가 있으면 false.
   *
   * 프로덕션 첫 배포와 같은 조건이다 — 운영에서는 마이그레이션이 앱보다 먼저 돌고,
   * 빈 DB 에 처음부터 재생해 스키마를 만든다. 그 결과가 prisma 스키마와 다르면
   * **앱이 없는 컬럼을 찾다가 런타임에 죽는다.**
   *
   * `status()` 로는 못 잡는다. 그쪽은 "마이그레이션 파일이 다 적용됐나" 만 보지
   * 결과가 스키마와 같은지는 안 본다. 실제로 app_llm_key.verify_state 가 그렇게 샜다 —
   * 스키마에 @map 이 빠져 dev 에서는 멀쩡했고 운영에서 처음 깨질 상태였다.
   *
   * 섀도 DB 를 쓴다(prisma 가 만들었다 지운다). 실제 DB 는 건드리지 않는다.
   */
  checkDrift(target: DbTarget): boolean {
    if (!this.config.shadowUrl) {
      throw new Error(
        'database.shadowUrl is required — migrations cannot be replayed without a shadow database.',
      );
    }

    const output = this.capture(target, [
      'migrate',
      'diff',
      '--from-migrations',
      `${this.schemaPath(target)}/migrations`,
      '--to-schema-datamodel',
      this.schemaPath(target),
      '--shadow-database-url',
      this.config.shadowUrl,
      '--script',
    ]);

    // 차이가 없으면 prisma 가 "empty migration" 주석만 낸다.
    if (output.includes('empty migration')) {
      return true;
    }
    console.error(output);
    return false;
  }

  /** Prisma Client 를 다시 생성한다. */
  generate(target: DbTarget): void {
    this.run(target, ['generate']);
  }

  /**
   * 스키마는 여러 파일로 쪼개져 있다(default·app·auth). 그래서 파일이 아니라 **디렉터리**를
   * 넘긴다 — prisma 가 폴더 안의 .prisma 를 모두 읽는다. package.json 의 prisma:generate 도
   * 같은 형태다.
   */
  private schemaPath(target: DbTarget): string {
    return `prisma/${target}`;
  }

  /** run 과 같지만 출력을 받아 온다. diff 처럼 결과를 읽어야 하는 커맨드에 쓴다. */
  private capture(target: DbTarget, args: string[]): string {
    const result = spawnSync('npx', ['prisma', ...args], {
      cwd: this.packageDir,
      encoding: 'utf-8',
      env: {
        ...process.env,
        DATABASE_URL: this.config.url,
        DATABASE_LOG_URL: this.config.logUrl,
        ...(this.config.shadowUrl ? { DATABASE_SHADOW_URL: this.config.shadowUrl } : {}),
      },
    });

    if (result.error) {
      throw result.error;
    }
    return `${result.stdout ?? ''}${result.stderr ?? ''}`;
  }

  private run(target: DbTarget, args: string[]): void {
    const result = spawnSync('npx', ['prisma', ...args, '--schema', this.schemaPath(target)], {
      cwd: this.packageDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL: this.config.url,
        DATABASE_LOG_URL: this.config.logUrl,
        ...(this.config.shadowUrl ? { DATABASE_SHADOW_URL: this.config.shadowUrl } : {}),
      },
    });

    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      // prisma 가 이미 에러를 출력했으므로 메시지를 덧붙이지 않는다.
      process.exit(result.status ?? 1);
    }
  }
}
