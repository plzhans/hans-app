import { Command } from 'commander';
import { ConfigSource } from '@hansapp/common';
import {
  MoisQueryService,
  MoisRegionSyncService,
  REGION_SYNC_MODES,
  type RegionSyncMode,
  type RegionSyncResult,
} from '@hansapp/admin-application';

import { withAdminContext } from '../context';
import { addExamples } from '../help';
import { printJson, printSimple } from '../output';
import { stageSyncCommand } from './stage';

/** --simple 로 보여줄 컬럼 */
const REGION_COLUMNS = ['region_cd', 'locatadd_nm', 'locallow_nm'];

interface RegionSyncCommandOptions {
  mode: string;
  quiet?: boolean;
}

/** --mode 값 검증. 오타를 조용히 넘기면 의도와 다른 정책으로 2만 행을 덮어쓴다. */
function parseMode(value: string): RegionSyncMode {
  if (!(REGION_SYNC_MODES as readonly string[]).includes(value)) {
    throw new Error(`알 수 없는 모드: ${value}\n사용 가능: ${REGION_SYNC_MODES.join(', ')}`);
  }
  return value as RegionSyncMode;
}

export function moisCommand(source: ConfigSource): Command {
  const mois = new Command('mois').description('행정안전부(MOIS) 행정표준코드 — 법정동코드');

  // 단계 배치. 배치(hansapp-batch)가 도는 것과 같은 경로다 — sync_state 에 기록되고
  // 신선도·잠금 판정을 그대로 받는다.
  mois.addCommand(stageSyncCommand('mois', source));

  const region = mois.command('region').description('법정동코드');

  region.addCommand(regionSyncCommand(source));

  addExamples(
    region
      .command('search')
      .description('법정동코드 조회. **원본 API 전용** (DB 미러를 읽지 않는다)')
      .option('--name <name>', '지역주소명. 부분일치다. 예: 송파')
      .option('-p, --page <number>', '페이지 번호', '1')
      .option('-n, --rows <number>', '한 페이지 결과 수 (최대 1000)', '10')
      .option('--pretty', 'JSON 응답에 색을 입혀 출력한다')
      .option('--simple', '주요 컬럼만 표로 출력한다')
      .action(
        async (
          options: {
            name?: string;
            page: string;
            rows: string;
            simple?: boolean;
            pretty?: boolean;
          },
          command: Command,
        ): Promise<void> => {
          const page = await withAdminContext(source, (context) =>
            context.get(MoisQueryService).getRegionCodes({
              pageNo: Number(options.page),
              numOfRows: Number(options.rows),
              locatadd_nm: options.name,
            }),
          );

          const { simple, pretty } = command.optsWithGlobals<{
            simple?: boolean;
            pretty?: boolean;
          }>();
          if (simple) {
            printSimple(page.rows, REGION_COLUMNS);
            return;
          }
          printJson(page, pretty);
        },
      ),
    [
      'hansapp-cli mois region search --name 송파 --simple',
      'hansapp-cli mois region search -n 1000            # 한 콜에 최대치',
    ],
  );

  return mois;
}

/**
 * 법정동코드 적재. **덮어쓰기 정책을 여기서 고른다.**
 *
 * 단계 커맨드(`mois sync --stage 1`)와 달리 sync_state 를 건드리지 않는다.
 * 정책을 바꿔 돌리는 건 사람이 개입하는 예외 상황이라, 배치의 진도 기록에 섞이면 안 된다.
 * 평소 적재는 단계 커맨드나 배치를 쓴다.
 */
function regionSyncCommand(source: ConfigSource): Command {
  return addExamples(
    new Command('sync')
      .description('법정동코드를 로컬 DB(mois_region_code)에 적재한다')
      .option(
        '-m, --mode <mode>',
        '기존 데이터를 덮어쓰는 방식\n' +
          '  merge    받은 행을 upsert 하고, 안 온 행에 폐지 표시(removed_at)를 한다. 기본값\n' +
          '  replace  전량을 받아 놓고 통째로 지운 뒤 다시 넣는다 (한 트랜잭션)\n' +
          '\n' +
          '  **평소에는 merge 를 쓴다.** replace 는 created_at/updated_at 을 매번 리셋해\n' +
          '  "언제부터 있던 코드인지 · 언제 값이 바뀌었는지" 를 지운다. 폐지된 코드도\n' +
          '  흔적 없이 사라져서, 병원 주소가 폐지된 동을 가리킬 때 이름을 못 붙인다.\n' +
          '  미러가 오염됐거나 컬럼 의미가 바뀌어 옛 행을 믿을 수 없을 때만 replace 다\n',
        'merge',
      )
      .option('--quiet', '진행 로그를 숨긴다')
      .action(async (options: RegionSyncCommandOptions): Promise<void> => {
        const mode = parseMode(options.mode);

        const result = await withAdminContext(
          source,
          (context) => context.get(MoisRegionSyncService).sync({ mode }),
          { verbose: !options.quiet },
        );

        printRegionSyncResult(result);
      }),
    [
      'hansapp-cli mois region sync                  # 기본 merge',
      'hansapp-cli mois region sync --mode replace   # 미러를 통째로 다시 만든다',
    ],
  );
}

function printRegionSyncResult(result: RegionSyncResult): void {
  const seconds = (result.elapsedMs / 1000).toFixed(1);
  const lines = [
    `법정동코드 sync 완료 (${result.mode})`,
    `  전체 건수  : ${result.totalCount.toLocaleString()}`,
    `  가져온 건수: ${result.fetched.toLocaleString()}`,
    `  반영 건수  : ${result.upserted.toLocaleString()}`,
    `  폐지 표시  : ${result.removed.toLocaleString()}`,
    `  현재 보관  : ${result.alive.toLocaleString()}`,
    `  API 콜 수  : ${result.pages}`,
    `  소요 시간  : ${seconds}초`,
    `  레벨별     : 시도 ${result.levels.sido} · 시군구 ${result.levels.sggu}` +
      ` · 읍면동 ${result.levels.umd.toLocaleString()} · 리 ${result.levels.ri.toLocaleString()}`,
  ];

  // 세종은 시도 행이 없어 시군구로 잡힌다. 시도가 15개인 게 정상이라는 걸 모르면
  // 매번 "하나 빠졌나" 를 의심하게 된다.
  if (result.levels.sido > 0) {
    lines.push('  * 세종특별자치시는 원본에 시도 행이 없어 시군구로 집계된다 (시도 15개가 정상)');
  }

  console.log(lines.join('\n'));
}
