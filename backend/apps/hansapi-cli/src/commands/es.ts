import * as path from 'node:path';

import { Command } from 'commander';
import { EnvSource } from '@hansapi/common';
import { ElasticsearchService, SearchSchemaService } from '@hansapi/search';
import { HealthcareIndexService } from '@hansapi/admin-application';

import { withAdminContext, withSearchContext } from '../context';
import { addExamples } from '../help';

/**
 * Elasticsearch 수동 관리 커맨드.
 *
 * 두 묶음이다:
 *   es schema *   — 스키마/설정(템플릿·인덱스·alias) 관리 (등록된 여러 인덱스를 함께 다룬다)
 *   es hospital * — 통합 병원(healthcare_hospital) 문서 색인
 *
 * 운영 정책: 앱은 alias 로만 접근하고, 실제 인덱스는 name-v1. 스키마가 바뀌면 v 를 올려
 * 재색인 후 alias 만 교체한다(schema import 가 alias 를 관리한다).
 */
export function esCommand(source: EnvSource): Command {
  const es = new Command('es').description(
    'Elasticsearch 색인 관리 · 병원 데이터 동기화',
  );

  registerSchema(es, source);
  registerHospital(es, source);

  return es;
}

function registerSchema(es: Command, source: EnvSource): void {
  const schema = es
    .command('schema')
    .description('ES 스키마/설정(템플릿·인덱스·alias) 관리');

  addExamples(
    schema
      .command('import')
      .description(
        '정본 스키마를 ES 에 적용한다(공유 분석기 + 인덱스 템플릿 + 최초 name-v1 + alias). 멱등하다',
      )
      .action(async (): Promise<void> => {
        const result = await withSearchContext(source, async (ctx) => {
          const endpoint = ctx.get(ElasticsearchService).endpoint;
          const svc = ctx.get(SearchSchemaService);
          console.log(
            [
              `ES 스키마 import  (env: ${source.env})`,
              `  대상 서버 → ${endpoint}`,
              `  정본 위치 → ${rel(svc.schemaDir)}`,
              '  원본 파일 →',
              ...svc.templateFiles().map((f) => `    ${rel(f)}`),
              '',
            ].join('\n'),
          );
          return svc.import();
        });

        console.log(`\nES 스키마 적용 완료`);
        console.log(`  공유 컴포넌트 템플릿 : ${result.componentTemplate}`);
        console.log(
          renderTable(
            ['인덱스', 'alias', '인덱스 생성'],
            result.indices.map((row) => [
              row.name,
              row.aliasTarget,
              row.createdIndex ? `${row.createdIndex} (신규)` : '기존 유지',
            ]),
          ),
        );
      }),
    ['hansapi-cli es schema import'],
  );

  schema
    .command('export')
    .argument('<dir>', '덤프를 저장할 디렉터리')
    .description('살아있는 ES 상태(템플릿·매핑·설정)를 파일로 덤프한다')
    .action(async (dir: string): Promise<void> => {
      const files = await withSearchContext(source, async (ctx) => {
        const endpoint = ctx.get(ElasticsearchService).endpoint;
        console.log(
          [
            `ES 설정 export  (env: ${source.env})`,
            `  원본 서버 → ${endpoint}`,
            `  저장 위치 → ${path.resolve(dir)}`,
            '',
          ].join('\n'),
        );
        return ctx.get(SearchSchemaService).export(dir);
      });
      console.log(`ES 상태 덤프 완료 (${files.length}개)`);
      for (const file of files) {
        console.log(`  ${file}`);
      }
    });

  schema
    .command('delete')
    .description(
      '⚠️ 등록된 모든 인덱스·템플릿·alias 를 삭제한다(구조·데이터 모두 소실)',
    )
    .option('--yes', '확인 없이 실행')
    .action(async (options: { yes?: boolean }): Promise<void> => {
      if (!options.yes) {
        console.error(
          '등록된 인덱스·템플릿·alias 를 모두 삭제합니다. 데이터가 사라집니다. 실행하려면 --yes 를 붙이세요.',
        );
        process.exitCode = 1;
        return;
      }
      await withSearchContext(source, (ctx) =>
        ctx.get(SearchSchemaService).delete(),
      );
      console.log('ES 스키마 삭제 완료(인덱스·템플릿·alias 삭제)');
    });

  schema
    .command('status')
    .description('현황: 인덱스별 alias→실제 인덱스, 템플릿 유무, 문서 수')
    .action(async (): Promise<void> => {
      const status = await withSearchContext(
        source,
        (ctx) => ctx.get(SearchSchemaService).status(),
        { verbose: false },
      );
      console.log(
        `ES 현황  (공유 컴포넌트 템플릿: ${status.componentTemplateExists ? '있음' : '없음'})`,
      );
      console.log(
        renderTable(
          ['인덱스', 'alias', '실제 인덱스', '템플릿', '문서 수'],
          status.indices.map((row) => [
            row.name,
            row.aliasExists ? '있음' : '없음',
            row.indices.join(', ') || '-',
            row.indexTemplateExists ? '있음' : '없음',
            row.docCount?.toLocaleString() ?? '-',
          ]),
        ),
      );
    });
}

function registerHospital(es: Command, source: EnvSource): void {
  const hospital = es
    .command('hospital')
    .description(
      '통합 병원(healthcare_hospital) 문서 색인 — alias 인덱스에 in-place',
    );

  addExamples(
    hospital
      .command('sync')
      .description('활성 병원 전량을 alias 인덱스에 bulk upsert 한다')
      .option('--quiet', '진행 로그를 숨긴다')
      .option(
        '--fresh',
        '색인 전에 기존 문서를 전량 비운다(비활성·삭제된 병원의 잔여 문서 제거 — 인덱스를 활성 DB와 정확히 일치시킴)',
      )
      .option(
        '--prune',
        'upsert 후 DB 에 없는(하드 삭제 + status 비활성) 병원 문서를 ES 에서 정리한다(대사)',
      )
      .action(
        async (options: {
          quiet?: boolean;
          fresh?: boolean;
          prune?: boolean;
        }): Promise<void> => {
          const started = Date.now();
          const result = await withAdminContext(
            source,
            async (ctx) => {
              const svc = ctx.get(HealthcareIndexService);

              // 색인할 인덱스가 없으면 스스로 만든다(그 인덱스만). 만들었을 때만 알린다.
              // ensure 는 **논리 이름**을 받는다(INDEX_DEFINITIONS 조회 → env 접두사는 내부에서 붙임).
              const created = await ctx
                .get(SearchSchemaService)
                .ensure(svc.logicalName);
              if (created?.createdIndex && !options.quiet) {
                console.log(
                  `  인덱스 없음 → 생성: ${created.createdIndex} (alias ${created.aliasTarget})`,
                );
              }

              if (options.fresh) {
                const deleted = await svc.clearData();
                if (!options.quiet) {
                  console.log(
                    `  기존 문서 비움: ${deleted.toLocaleString()}건 삭제`,
                  );
                }
              }
              const indexResult = await svc.syncAll(
                options.quiet
                  ? undefined
                  : (processed, total, target) => {
                      const pct =
                        total > 0
                          ? ((processed / total) * 100).toFixed(1)
                          : '0.0';
                      const secs = ((Date.now() - started) / 1000).toFixed(1);
                      // 어느 인덱스에 색인 중인지 함께 보여준다(in-place 라 target = alias).
                      process.stdout.write(
                        `  ${target}: 색인 중… ${processed.toLocaleString()} / ${total.toLocaleString()} (${pct}%)  ${secs}초   \r`,
                      );
                    },
              );
              // 대사는 upsert 뒤에 돈다 — 방금 활성화된 병원까지 반영된 상태로 유지 대상을 잡는다.
              const pruned = options.prune ? await svc.reconcile() : 0;
              return { ...indexResult, pruned };
            },
            { verbose: !options.quiet },
          );
          if (!options.quiet) {
            process.stdout.write('\n');
          }
          console.log(
            [
              `병원 색인 완료${options.fresh ? ' (fresh: 비우고 재색인)' : ''}`,
              `  대상      : ${result.total.toLocaleString()}`,
              `  성공      : ${result.indexed.toLocaleString()}`,
              `  실패      : ${result.failed.toLocaleString()} (ES 색인 거부)`,
              `  건너뜀    : ${result.skipped.toLocaleString()} (문서 변환 실패)`,
              ...(options.prune
                ? [
                    `  정리(삭제): ${result.pruned.toLocaleString()} (DB 에 없는·비활성 문서)`,
                  ]
                : []),
              `  소요 시간 : ${((Date.now() - started) / 1000).toFixed(1)}초`,
            ].join('\n'),
          );
          // 변환 실패가 있으면 성공으로 끝내지 않는다 — 인덱스가 조용히 반쪽나는 걸 막는다.
          if (result.skipped > 0) {
            process.exitCode = 1;
          }
        },
      ),
    [
      'hansapi-cli es hospital sync',
      'hansapi-cli es hospital sync --prune',
      'hansapi-cli es hospital sync --fresh',
      'hansapi-cli es hospital sync --quiet',
    ],
  );

  addExamples(
    hospital
      .command('reindex')
      .description(
        '무중단 재색인(blue-green) — 새 버전 인덱스에 전량 색인 후 alias 를 원자 스왑하고 옛 버전 삭제. stale 문서가 남지 않는다',
      )
      .option('--quiet', '진행 로그를 숨긴다')
      .action(async (options: { quiet?: boolean }): Promise<void> => {
        const started = Date.now();
        const result = await withAdminContext(
          source,
          (ctx) => {
            const svc = ctx.get(HealthcareIndexService);
            const alias = svc.indexName;
            return svc.reindex(
              options.quiet
                ? undefined
                : (processed, total, target) => {
                    const pct =
                      total > 0
                        ? ((processed / total) * 100).toFixed(1)
                        : '0.0';
                    const secs = ((Date.now() - started) / 1000).toFixed(1);
                    // 어느 인덱스에 색인 중인지 함께 보여준다(alias → 새 버전 인덱스).
                    process.stdout.write(
                      `  ${alias} → ${target}: 색인 중… ${processed.toLocaleString()} / ${total.toLocaleString()} (${pct}%)  ${secs}초   \r`,
                    );
                  },
            );
          },
          { verbose: !options.quiet },
        );
        if (!options.quiet) {
          process.stdout.write('\n');
        }
        console.log(
          [
            result.swapped
              ? '재색인 완료 (alias 스왑됨)'
              : '⚠️ 재색인 중단 — 색인 건수 미달로 스왑 안 함(라이브는 옛 인덱스 유지)',
            `  새 인덱스 : ${result.newIndex}`,
            `  대상      : ${result.total.toLocaleString()}`,
            `  성공      : ${result.indexed.toLocaleString()}`,
            `  실패      : ${result.failed.toLocaleString()} (ES 색인 거부)`,
            `  건너뜀    : ${result.skipped.toLocaleString()} (문서 변환 실패)`,
            result.swapped
              ? `  삭제한 옛 인덱스 : ${result.droppedIndices.join(', ') || '없음'}`
              : `  새 인덱스 ${result.newIndex} 는 삭제됨`,
            `  소요 시간 : ${((Date.now() - started) / 1000).toFixed(1)}초`,
          ].join('\n'),
        );
        // 스왑까지 못 갔으면(가드 실패) 성공으로 끝내지 않는다.
        if (!result.swapped) {
          process.exitCode = 1;
        }
      }),
    [
      'hansapi-cli es hospital reindex',
      'hansapi-cli es hospital reindex --quiet',
    ],
  );

  hospital
    .command('clear')
    .description(
      '⚠️ alias 인덱스의 병원 문서를 전량 비운다(인덱스·매핑은 유지)',
    )
    .option('--yes', '확인 없이 실행')
    .action(async (options: { yes?: boolean }): Promise<void> => {
      if (!options.yes) {
        console.error(
          'alias 인덱스의 모든 병원 문서를 비웁니다. 실행하려면 --yes 를 붙이세요.',
        );
        process.exitCode = 1;
        return;
      }
      const deleted = await withAdminContext(source, (ctx) =>
        ctx.get(HealthcareIndexService).clearData(),
      );
      console.log(`병원 문서 비움 완료 (${deleted.toLocaleString()}건 삭제)`);
    });

  hospital
    .command('sync-one')
    .argument('<id>', '병원 id (healthcare_hospital.id)')
    .description('특정 병원 1건을 색인한다')
    .action(async (idArg: string): Promise<void> => {
      const id = parseId(idArg);
      const result = await withAdminContext(source, (ctx) =>
        ctx.get(HealthcareIndexService).syncOne(id),
      );
      console.log(
        result.found
          ? `병원 ${id} 색인 완료`
          : `병원 ${id} 를 찾지 못했습니다(비활성이거나 없음)`,
      );
      if (!result.found) {
        process.exitCode = 1;
      }
    });

  hospital
    .command('delete')
    .argument('<id>', '병원 id (healthcare_hospital.id)')
    .description('특정 병원 1건을 색인에서 삭제한다')
    .action(async (idArg: string): Promise<void> => {
      const id = parseId(idArg);
      const result = await withAdminContext(source, (ctx) =>
        ctx.get(HealthcareIndexService).deleteOne(id),
      );
      console.log(
        result.deleted
          ? `병원 ${id} 삭제 완료`
          : `병원 ${id} 는 색인에 없었습니다`,
      );
    });
}

/**
 * 표시용 경로. cwd(보통 backend/) 안이면 상대경로로 짧게, 밖(외부 오버라이드 등)이면
 * 절대경로 그대로 — cwd 밖을 상대경로로 만들면 ../../.. 로 오히려 지저분해진다.
 */
function rel(absolute: string): string {
  const relative = path.relative(process.cwd(), absolute);
  return relative.startsWith('..') ? absolute : relative;
}

/** <id> 인자를 양의 정수로 파싱한다. 잘못되면 즉시 종료. */
function parseId(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    console.error(`병원 id 는 양의 정수여야 합니다: ${value}`);
    process.exit(1);
  }
  return id;
}

/** 표시 폭(한글·CJK 는 2칸). 터미널 정렬용. */
function displayWidth(text: string): number {
  let width = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    width += isWide(code) ? 2 : 1;
  }
  return width;
}

function isWide(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) || // 한글 자모
    (code >= 0x2e80 && code <= 0xa4cf) || // CJK 부수·한중일 통합
    (code >= 0xac00 && code <= 0xd7a3) || // 한글 음절
    (code >= 0xf900 && code <= 0xfaff) || // CJK 호환
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) || // 전각
    (code >= 0xffe0 && code <= 0xffe6)
  );
}

/** 간단한 정렬 표(한글 폭 반영). 값은 문자열로 넘긴다. */
function renderTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) =>
    Math.max(displayWidth(h), ...rows.map((r) => displayWidth(r[i] ?? ''))),
  );
  const pad = (text: string, i: number): string =>
    text + ' '.repeat(Math.max(0, widths[i] - displayWidth(text)));
  const line = (cells: string[]): string =>
    '  ' + cells.map((c, i) => pad(c ?? '', i)).join('   ');
  const sep = '  ' + widths.map((w) => '─'.repeat(w)).join('   ');
  return [line(headers), sep, ...rows.map(line)].join('\n');
}
