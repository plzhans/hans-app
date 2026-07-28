import { INestApplicationContext } from '@nestjs/common';
import { Command } from 'commander';
import { ConfigSource } from '@hansapi/common';
import {
  DEFAULT_SYNC_ROWS,
  SyncOptions,
  SyncResult,
} from '@hansapi/admin-application';

import { withAdminContext } from '../context';
import { addExamples } from '../help';

interface SyncCommandOptions {
  full?: boolean;
  page: string;
  rows?: string;
  quiet?: boolean;
  debug?: boolean;
}

/**
 * 병원 sync 커맨드를 만든다. NMC·HIRA 가 옵션 체계가 같아 한 곳에서 정의한다.
 *
 * 실행 로직은 admin-application 계층에 있고, CLI 는 옵션을 해석해 넘기기만 한다.
 */
export function syncCommand(
  label: string,
  source: ConfigSource,
  runSync: (
    context: INestApplicationContext,
    options: SyncOptions,
  ) => Promise<SyncResult>,
): Command {
  const command = new Command('sync')
    .description(`${label} 병원 목록을 로컬 DB 에 적재한다`)
    .option('--full', `전체를 적재한다. 주지 않으면 한 페이지만 적재한다`)
    .option(
      '-p, --page <number>',
      '적재할 페이지 번호. --full 이면 무시된다',
      '1',
    )
    .option(
      '-n, --rows <number>',
      `한 페이지 결과 수. 생략하면 --full 일 때 ${DEFAULT_SYNC_ROWS}, 아니면 1`,
    )
    .option('--quiet', '페이지별 진행 로그를 숨긴다')
    .option('--debug', '건별 호출 로그까지 낸다')
    .action(async (options: SyncCommandOptions): Promise<void> => {
      const syncOptions: SyncOptions = {
        full: options.full,
        pageNo: Number(options.page),
        numOfRows: options.rows ? Number(options.rows) : undefined,
      };

      const result = await withAdminContext(
        source,
        (context) => runSync(context, syncOptions),
        { verbose: !options.quiet, debug: options.debug },
      );

      printResult(label, result);
    });

  const provider = label.toLowerCase();
  return addExamples(command, [
    `hansapi-cli ${provider} hospital sync            # 1건만 (기본값)`,
    `hansapi-cli ${provider} hospital sync -n 100     # 1페이지 100건`,
    `hansapi-cli ${provider} hospital sync -p 3 -n 100  # 3페이지만`,
    `hansapi-cli ${provider} hospital sync --full     # 전체 (${DEFAULT_SYNC_ROWS}건씩)`,
  ]);
}

function printResult(label: string, result: SyncResult): void {
  const seconds = (result.elapsedMs / 1000).toFixed(1);
  console.log(
    [
      `${label} 병원 sync 완료`,
      `  API 전체 건수 : ${result.totalCount.toLocaleString()}`,
      `  가져온 건수   : ${result.fetched.toLocaleString()}`,
      `  DB 반영 건수  : ${result.upserted.toLocaleString()}`,
      `  API 호출 수   : ${result.pages}`,
      ...(result.regions === undefined
        ? []
        : [`  지역 조합     : ${result.regions.toLocaleString()}`]),
      `  소요 시간     : ${seconds}초`,
    ].join('\n'),
  );
}
