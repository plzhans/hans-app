import { Command } from 'commander';
import { ConfigSource } from '@hansapp/common';
import { DB_TARGETS, DbTarget, PrismaMigrationService } from '@hansapp/data';

import { withAdminContext, withDataContext } from '../context';
import { addExamples } from '../help';
import { HealthcareCodeSeedService, HiraCodeSeedService } from '@hansapp/admin-application';

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
    throw new Error(`Unknown database: ${db}. Available: ${DB_TARGETS.join(', ')}`);
  }

  await withDataContext(source, (context) => {
    action(context.get(PrismaMigrationService), db);
    return Promise.resolve();
  });
}

/** 모든 db 커맨드에 붙는 대상 DB 옵션 */
function withDbOption(command: Command): Command {
  return command.option('--db <name>', `대상 DB. ${DB_TARGETS.join(' | ')}`, 'main');
}

export function dbCommand(source: ConfigSource): Command {
  const db = new Command('db').description(
    'DB 스키마 관리 (Prisma). 메인·로그 DB 를 --db 로 고른다',
  );

  addExamples(
    withDbOption(
      db
        .command('migrate')
        .description('스키마 변경분으로 마이그레이션을 만들고 적용한다 (개발용)')
        .option('--name <name>', '마이그레이션 이름. 생략하면 프롬프트로 묻는다'),
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
      await run(source, options.db, (service, target) => service.deploy(target));
    }),
    ['hansapp-cli db deploy', 'hansapp-cli db deploy --env prod'],
  );

  withDbOption(db.command('status').description('마이그레이션 적용 상태를 확인한다')).action(
    async (options: DbOptions) => {
      await run(source, options.db, (service, target) => service.status(target));
    },
  );

  addExamples(
    db
      .command('check')
      .description(
        '마이그레이션만으로 스키마가 그대로 재현되는지 본다 (운영 첫 배포와 같은 조건).\n' +
          '차이가 있으면 SQL 을 찍고 1 로 종료한다 — CI 에서 그대로 쓸 수 있다',
      )
      /*
        **다른 커맨드와 달리 --db 에 기본값을 두지 않는다.** 기본이 'main' 이면 log 를
        영영 안 보게 되는데, 한쪽만 어긋나도 배포는 깨진다. 안 주면 둘 다 본다.
      */
      .option('--db <name>', `대상 DB. 생략하면 둘 다. ${DB_TARGETS.join(' | ')}`)
      .action(async (options: DbOptions) => {
        let ok = true;
        await withDataContext(source, (context) => {
          const service = context.get(PrismaMigrationService);
          // --db 를 안 주면 둘 다 본다. 한쪽만 맞아도 배포는 깨진다.
          const targets = options.db ? [options.db] : [...DB_TARGETS];
          for (const target of targets) {
            if (service.checkDrift(target)) {
              console.log(`  ✅ ${target}: 마이그레이션이 스키마를 그대로 재현한다`);
            } else {
              ok = false;
              console.error(`  ❌ ${target}: 마이그레이션 결과가 스키마와 다르다`);
            }
          }
          return Promise.resolve();
        });

        if (!ok) {
          console.error(
            '\n스키마를 고쳤으면 마이그레이션을 함께 만들어라.' +
              ' 컬럼 이름만 어긋난 것이면 @map 을 붙인다(DB 는 snake, 필드는 camel).',
          );
          process.exitCode = 1;
        }
      }),
    ['hansapp-cli db check', 'hansapp-cli db check --db log'],
  );

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
        const { result, hira } = await withAdminContext(source, async (context) => ({
          result: await context.get(HealthcareCodeSeedService).seed(),
          hira: await context.get(HiraCodeSeedService).seed(),
        }));

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
