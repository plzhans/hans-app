import { Command } from 'commander';
import { ConfigSource } from '@hansapi/common';
import { HiraNmcMatchService } from '@hansapi/admin-application';

import { withAdminContext } from '../context';
import { addExamples } from '../help';

/**
 * HIRA ↔ NMC 매칭 커맨드.
 *
 * API 콜이 0이다. 매칭 키(이름·전화·좌표)가 전부 목록 API 에 있어서, 양쪽 1단계만 끝나면
 * DB 안에서 계산으로 끝난다. 상세 적재(2단계 이후)를 기다릴 필요가 없다.
 */
export function hiraNmcCommand(source: ConfigSource): Command {
  const command = new Command('hira-nmc').description(
    'HIRA ↔ NMC 병원 매칭 (API 콜 없음)',
  );

  addExamples(
    command
      .command('match')
      .description('미확정 병원을 판정한다. 확정된 것은 건드리지 않는다')
      .option(
        '--recheck',
        '자동 확정분도 다시 판정한다 (룰을 고쳤을 때). 사람이 정한 것(manual)은 그대로 둔다',
      )
      .option('--dry-run', 'DB 를 건드리지 않고 판정 결과만 센다')
      .option('--quiet', '진행 로그를 숨긴다')
      .action(
        async (options: {
          recheck?: boolean;
          dryRun?: boolean;
          quiet?: boolean;
        }): Promise<void> => {
          const result = await withAdminContext(
            source,
            (context) =>
              context.get(HiraNmcMatchService).match({
                recheck: options.recheck,
                dryRun: options.dryRun,
              }),
            { verbose: !options.quiet },
          );

          const seconds = (result.elapsedMs / 1000).toFixed(1);
          console.log(
            [
              options.dryRun ? '매칭 (dry-run — DB 미반영)' : '매칭 완료',
              `  판정 대상   : ${result.targets.toLocaleString()}`,
              `  자동 확정   : ${result.auto.toLocaleString()}`,
              `  리뷰 필요   : ${result.review.toLocaleString()}`,
              `  거부        : ${result.rejected.toLocaleString()}`,
              `  후보 없음   : ${result.noCandidate.toLocaleString()}`,
              `  소요 시간   : ${seconds}초`,
            ].join('\n'),
          );
        },
      ),
    [
      'hansapi-cli hira-nmc match',
      'hansapi-cli hira-nmc match --dry-run',
      'hansapi-cli hira-nmc match --recheck',
    ],
  );

  addExamples(
    command
      .command('status')
      .description('매칭 상태를 집계해 보여준다')
      .action(async (): Promise<void> => {
        const rows = await withAdminContext(source, (context) =>
          context.get(HiraNmcMatchService).summary(),
        );

        if (rows.length === 0) {
          console.log('아직 매칭을 돌리지 않았다.');
          return;
        }
        for (const row of rows) {
          console.log(
            `  ${row.status.padEnd(14)} ${row.count.toLocaleString()}`,
          );
        }
      }),
    ['hansapi-cli hira-nmc status'],
  );

  return command;
}
