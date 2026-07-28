import { Command } from 'commander';
import { ConfigSource } from '@hansapi/common';
import {
  HIRA_ALL_OPS,
  HIRA_DETAIL_OPS,
  HIRA_EXTRA_OPS,
  HIRA_STAGES,
  HiraStageService,
  NMC_STAGES,
  NmcStageService,
  SyncStateService,
  type StageResult,
} from '@hansapi/admin-application';

import { withAdminContext } from '../context';
import { addExamples } from '../help';

/**
 * 단계 설명. 계획 문서(docs/krdata-cache-plan.md)와 1:1 이다.
 * 도움말에 콜수까지 적는다. 콜수 제한이 있어 실행 전에 규모를 알아야 한다.
 */
const NMC_STAGE_HELP: Record<number, string> = {
  1: '전체 병원 벌크 + 진료과목 역조회 (62콜, 매일)',
  2: '규모기관 basic — 종합 380 → 병원 1,429 → 한방 613 → 치과 246 → 요양 1,283 (3,951콜)',
  3: '의원급 basic 74,680 (운영계정 필요)',
};

const HIRA_STAGE_HELP: Record<number, string> = {
  1: '전체 병원 벌크 + 진료과목·전문병원 역조회 + 병원평가 + 비급여 (294콜, 매일)',
  2: '상급종합 47 × 개별 10종 (470콜)',
  3: '종합병원 338 × 10종 (3,380콜)',
  4: '병원 1,429 × 10종 (14,290콜)',
  5: '정신병원 261 × 10종 (2,610콜)',
  6: '한방병원 624 × 10종 (6,240콜)',
  7: '치과병원 247 × 10종 (2,470콜)',
  8: '요양병원 1,285 × 10종 (12,850콜)',
  9: '의원 37,789 × 10종 (운영계정 필요)',
  10: '치과의원 19,380 × 10종 (운영계정 필요)',
  11: '한의원 14,873 × 10종 (운영계정 필요)',
  12: '보건기관 등 3,466 × 10종 (운영계정 필요)',
};

function stageHelp(help: Record<number, string>): string {
  return Object.entries(help)
    .map(([stage, text]) => `  ${stage.padStart(2)}  ${text}`)
    .join('\n');
}

interface StageOptions {
  stage: string;
  limit?: string;
  force?: boolean;
  quiet?: boolean;
  debug?: boolean;
  op?: string[];
}

/** --op 값 검증. 오타를 조용히 넘기면 콜만 쓰고 아무것도 안 받는다. */
function parseOps(values: string[] | undefined): readonly string[] | undefined {
  if (!values || values.length === 0) {
    return undefined;
  }
  const unknown = values.filter(
    (op) => !(HIRA_ALL_OPS as readonly string[]).includes(op),
  );
  if (unknown.length > 0) {
    throw new Error(
      `알 수 없는 오퍼레이션: ${unknown.join(', ')}\n사용 가능: ${HIRA_ALL_OPS.join(', ')}`,
    );
  }
  return values;
}

/** --stage 값 검증. 없는 단계를 조용히 넘기지 않는다. */
function parseStage<T extends number>(value: string, stages: readonly T[]): T {
  const stage = Number(value);
  if (!stages.includes(stage as T)) {
    throw new Error(
      `알 수 없는 단계: ${value}\n사용 가능: ${stages.join(', ')}`,
    );
  }
  return stage as T;
}

/**
 * 단계 sync 커맨드. NMC·HIRA 가 옵션 체계는 같고 단계 구성만 다르다.
 *
 * 실행 로직은 admin-application 의 StageService 가 갖는다. CLI 는 옵션 파싱과 출력만 한다.
 */
export function stageSyncCommand(
  provider: 'nmc' | 'hira',
  source: ConfigSource,
): Command {
  const isNmc = provider === 'nmc';
  const help = isNmc ? NMC_STAGE_HELP : HIRA_STAGE_HELP;
  const label = provider.toUpperCase();

  const command = new Command('sync')
    .description(`${label} 데이터를 단계별로 로컬 DB 에 적재한다`)
    .requiredOption('-s, --stage <number>', `실행할 단계\n${stageHelp(help)}\n`)
    .option(
      '-l, --limit <number>',
      '이번 실행에서 쓸 최대 API 콜 수. 개발계정 일 한도(1,000건) 대응.\n' +
        '한도에 걸리면 멈추고, 다음 실행에서 못 받은 병원부터 이어받는다\n',
    )
    .option(
      '--force',
      '오늘 이미 성공한 단계도 다시 돌린다. 개별 조회 단계에서는 받은 병원도 다시 받는다',
    )
    .option('--quiet', '진행 로그를 숨긴다')
    .option(
      '--debug',
      '병원 하나하나의 호출 로그까지 낸다. 무엇이 몇 행 왔는지 본다',
    );

  if (!isNmc) {
    command.option(
      '--op <name...>',
      '받을 오퍼레이션만 지정한다 (HIRA 상세 단계 전용).\n' +
        `기본 10종: ${HIRA_DETAIL_OPS.join(', ')}\n` +
        '생략하면 10종 전부. 등급 하나를 10종으로 완성하는 게 기본이므로 평소엔 쓰지 마라.\n' +
        '새 오퍼레이션을 뒤늦게 추가해 그것만 채울 때 쓴다\n' +
        `기본 세트 밖(opt-in): ${HIRA_EXTRA_OPS.join(', ')}\n` +
        '  specialty 전문병원지정분야. 1단계가 19콜에 전수로 받으므로 평소엔 불필요.\n' +
        '            역조회 결과를 개별 조회와 대조할 때만 쓴다\n',
    );
  }

  command.action(async (options: StageOptions): Promise<void> => {
    const result = await withAdminContext(
      source,
      (context) => {
        if (isNmc) {
          const stage = parseStage(options.stage, NMC_STAGES);
          return context.get(NmcStageService).run(stage, {
            force: options.force,
            limit: options.limit ? Number(options.limit) : undefined,
          });
        }
        const stage = parseStage(options.stage, HIRA_STAGES);
        return context.get(HiraStageService).run(stage, {
          force: options.force,
          limit: options.limit ? Number(options.limit) : undefined,
          ops: parseOps(options.op),
        });
      },
      { verbose: !options.quiet, debug: options.debug },
    );

    printStageResult(label, Number(options.stage), result);
  });

  return addExamples(command, [
    `hansapi-cli ${provider} sync --stage 1              # 매일 도는 벌크 + 역조회`,
    `hansapi-cli ${provider} sync --stage 2 --limit 500  # 개별 조회를 500콜까지만`,
    `hansapi-cli ${provider} sync --stage 1 --force      # 오늘 이미 성공했어도 다시`,
    ...(isNmc
      ? []
      : [
          `hansapi-cli hira sync --stage 2 --op transport   # 교통정보만 (병원당 1콜)`,
        ]),
  ]);
}

function printStageResult(
  label: string,
  stage: number,
  result: StageResult,
): void {
  if (result.skipped) {
    console.log(
      `${label} ${stage}단계 건너뜀 — ${result.skipReason}. (--force 로 강제 실행)`,
    );
    return;
  }

  const seconds = (result.elapsedMs / 1000).toFixed(1);
  console.log(
    [
      `${label} ${stage}단계 완료`,
      `  API 콜 수  : ${result.calls.toLocaleString()}`,
      `  처리 건수  : ${result.processed.toLocaleString()}`,
      `  소요 시간  : ${seconds}초`,
    ].join('\n'),
  );
}

/** 단계별 실행 상태를 표로 보여준다. 어디까지 갔는지 여기서 본다. */
export function syncStatusCommand(source: ConfigSource): Command {
  return addExamples(
    new Command('sync-status')
      .description('단계별 동기화 상태를 조회한다')
      .action(async (): Promise<void> => {
        const rows = await withAdminContext(source, (context) =>
          context.get(SyncStateService).list(),
        );

        if (rows.length === 0) {
          console.log('아직 실행된 단계가 없다.');
          return;
        }

        const header = ['job', 'status', 'calls', 'processed', 'last_success'];
        console.log(header.join('\t'));
        for (const row of rows) {
          console.log(
            [
              row.job,
              row.status,
              row.calls.toLocaleString(),
              row.processed.toLocaleString(),
              row.lastSuccessAt?.toLocaleString('ko-KR') ?? '-',
            ].join('\t'),
          );
        }
      }),
    ['hansapi-cli sync-status'],
  );
}
