import { Command } from 'commander';
import {
  R2UploaderService,
  SitemapService,
  SitemapWriterService,
  type MedifinderConfig,
} from '@medifinder/admin-application';

import { withApplicationContext } from '../context';
import { describeConfig } from '../config';
import { addExamples } from '../help';

/**
 * 사이트맵 커맨드.
 *
 * **만들기와 올리기가 갈려 있다.** 만들다 실패하면 R2 에 손을 대지 않으므로 지난 회차가
 * 그대로 살아 있고, 만들어 둔 산출물을 눈으로 확인한 뒤 올릴 수 있다. CI 도 이 둘을
 * 따로 돌린다 — 만드는 잡에는 R2 자격증명을 주지 않는다.
 *
 * 설정은 `load()` 로 받는다. 커맨드를 만들 때가 아니라 **고른 커맨드가 실제로 돌 때**
 * 읽으려는 것이다 — 도움말에는 자격증명이 필요 없다.
 */
export function sitemapCommand(load: () => MedifinderConfig): Command {
  const sitemap = new Command('sitemap').description('medifinder.kr 사이트맵 생성·업로드');

  addExamples(
    sitemap
      .command('build')
      .description('hans-api 를 훑어 사이트맵을 만든다. 지정한 경로에 쓴다')
      .requiredOption('--out <dir>', '산출물을 쓸 디렉터리')
      .option(
        '--limit <count>',
        '받아 올 최대 병원 수. 100건 단위로 끊기므로 뒤쪽 등급이 통째로 빠질 수 있다 (개발용)',
        toInt,
      )
      .option('--min-urls <count>', '이 수보다 적게 나오면 실패시킨다', toInt)
      .action(async (options: { out: string; limit?: number; minUrls?: number }): Promise<void> => {
        const config = announce(load());
        const result = await withApplicationContext(config, async (context) => {
          const service = context.get(SitemapService);
          return service.build(options.out, { limit: options.limit, minUrls: options.minUrls });
        });

        console.log('');
        console.log(`사이트맵 생성 완료  → ${result.dir}`);
        console.log(renderTable(result.files.map((file) => [file.name, String(file.locCount)])));
        console.log(`총 ${result.total} URL / ${result.files.length}개 파일`);
      }),
    [
      'medifinder-cli sitemap build --out ./out',
      'medifinder-cli sitemap build --out ./out --limit 500     # 파일 모양만 확인',
      'medifinder-cli sitemap build --out ./out --min-urls 80000',
    ],
  );

  addExamples(
    sitemap
      .command('upload')
      .description('만들어 둔 사이트맵을 R2 에 올린다')
      .requiredOption('--from <dir>', '산출물이 있는 디렉터리')
      .action(async (options: { from: string }): Promise<void> => {
        const config = announce(load());
        const names = await withApplicationContext(config, async (context) => {
          const files = await context.get(SitemapWriterService).list(options.from);
          if (files.length === 0) {
            throw new Error(
              `No sitemap files found in ${options.from}. Run "sitemap build" first.`,
            );
          }
          await context.get(R2UploaderService).uploadDir(options.from, files);
          return files;
        });

        console.log('');
        console.log(`업로드 완료  ${names.length}개 파일`);
      }),
    ['medifinder-cli sitemap upload --from ./out'],
  );

  return sitemap;
}

/** 어느 API·어느 버킷으로 도는지 **stderr** 로 남긴다(stdout=커맨드 출력 오염 방지). */
function announce(config: MedifinderConfig): MedifinderConfig {
  process.stderr.write(`${describeConfig(config)}\n\n`);
  return config;
}

function toInt(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`expected a positive integer, got "${value}".`);
  }
  return parsed;
}

/** 이름·건수 두 칸짜리 표. 영문·숫자만 담기므로 폭 계산이 단순하다. */
function renderTable(rows: string[][]): string {
  const widths = [0, 1].map((column) => Math.max(...rows.map((row) => row[column].length)));
  return rows
    .map((row) => `  ${row[0].padEnd(widths[0])}  ${row[1].padStart(widths[1])}`)
    .join('\n');
}
