import { Command } from 'commander';
import { ConfigSource } from '@hansapp/common';
import { DB_TARGETS, DbTarget, PrismaMigrationService } from '@hansapp/data';

import { withAdminContext, withDataContext } from '../context';
import { addExamples } from '../help';
import {
  HealthcareCodeSeedService,
  HiraCodeSeedService,
} from '@hansapp/admin-application';

interface DbOptions {
  db: DbTarget;
}

/**
 * 마이그레이션 실행은 데이터 계층(PrismaMigrationService)이 소유한다.
 * 스키마 경로도 prisma 실행 방법도 CLI 는 알지 못한다. 커맨드를 파싱해 호출만 한다.
 */
async function run(
  source: ConfigSource,
  db: DbTarget,
  action: (service: PrismaMigrationService, target: DbTarget) => void,
): Promise<void> {
  if (!DB_TARGETS.includes(db)) {
    throw new Error(
      `알 수 없는 DB: ${db}. 가능한 값: ${DB_TARGETS.join(', ')}`,
    );
  }

  await withDataContext(source, (context) => {
    action(context.get(PrismaMigrationService), db);
    return Promise.resolve();
  });
}

/** 모든 db 커맨드에 붙는 대상 DB 옵션 */
function withDbOption(command: Command): Command {
  return command.option(
    '--db <name>',
    `대상 DB. ${DB_TARGETS.join(' | ')}`,
    'main',
  );
}

export function dbCommand(source: ConfigSource): Command {
  const db = new Command('db').description(
    'DB 스키마 관리 (Prisma). 메인·로그 DB 를 --db 로 고른다',
  );

  addExamples(
    withDbOption(
      db
        .command('migrate')
        .description(
          '스키마 변경분으로 마이그레이션을 만들고 적용한다 (개발용)',
        )
        .option(
          '--name <name>',
          '마이그레이션 이름. 생략하면 프롬프트로 묻는다',
        ),
    ).action(async (options: DbOptions & { name?: string }) => {
      await run(source, options.db, (service, target) =>
        service.migrate(target, { name: options.name }),
      );
    }),
    [
      'hansapp-cli db migrate --name add_hospital_index',
      'hansapp-cli db migrate --db log --name add_sync_log',
    ],
  );

  addExamples(
    withDbOption(
      db
        .command('deploy')
        .description(
          '이미 만들어진 마이그레이션을 적용한다. SQL 을 생성하지 않고 데이터도 지우지 않는다',
        ),
    ).action(async (options: DbOptions) => {
      await run(source, options.db, (service, target) =>
        service.deploy(target),
      );
    }),
    ['hansapp-cli db deploy', 'hansapp-cli db deploy --env prod'],
  );

  withDbOption(
    db.command('status').description('마이그레이션 적용 상태를 확인한다'),
  ).action(async (options: DbOptions) => {
    await run(source, options.db, (service, target) => service.status(target));
  });

  db.command('generate')
    .description('Prisma Client 를 다시 생성한다 (메인·로그 모두)')
    .action(async () => {
      await withDataContext(source, (context) => {
        const service = context.get(PrismaMigrationService);
        for (const target of DB_TARGETS) {
          service.generate(target);
        }
        return Promise.resolve();
      });
    });

  addExamples(
    db
      .command('seed')
      .description(
        '코드를 시드 파일로 적재한다. 시드 파일이 유일한 원본이다.\n' +
          '  healthcare_code  통합 코드 (HIRA+NMC 를 우리 코드로)\n' +
          '  hira_code        API 가 코드표를 안 주는 HIRA 코드 (병원평가 항목·그룹)',
      )
      .action(async (): Promise<void> => {
        const { result, hira } = await withAdminContext(
          source,
          async (context) => ({
            result: await context.get(HealthcareCodeSeedService).seed(),
            hira: await context.get(HiraCodeSeedService).seed(),
          }),
        );

        console.log(
          [
            '코드 시드 완료',
            `  통합 코드 : ${result.seeded.toLocaleString()}`,
            `  지역      : ${result.regions.toLocaleString()}`,
            `  HIRA 코드 : ${hira.seeded.toLocaleString()} (병원평가 항목)`,
            `  삭제      : ${(result.removed + hira.removed).toLocaleString()} (시드에서 빠진 코드)`,
            `  미매핑    : ${result.unmapped.length.toLocaleString()} (원본에 있는데 시드에 없음)`,
          ].join('\n'),
        );

        for (const row of result.unmapped) {
          console.log(`    ${row.tp}/${row.src} ${row.cd} ${row.nm}`);
        }
      }),
    ['hansapp-cli db seed'],
  );

  return db;
}
