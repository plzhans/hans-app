#!/usr/bin/env node
// NestJS DI 가 데코레이터 메타데이터를 읽으려면 가장 먼저 로드돼야 한다.
import 'reflect-metadata';

import { Command } from 'commander';
import { describeError } from '@medifinder/admin-application';

import { sitemapCommand } from './commands/sitemap';
import { loadConfig } from './config';
import { addExamples, localizeHelp } from './help';

/**
 * MediFinder 운영 CLI.
 *
 * hans-api 를 공개 API 로만 읽는다. DB 도 내부 패키지(@hansapp/*)도 쓰지 않는다 —
 * MediFinder 는 그 시스템의 일부가 아니라 외부 소비자다.
 *
 * 지금은 GitHub Actions 가 정해진 시각에 부른다. 부하가 커져 전용 서버로 옮기면
 * 워크플로만 지우면 된다. 이 파일은 그대로다.
 *
 * **설정은 커맨드가 실제로 돌 때 읽는다.** 여기서 미리 읽으면 `--help` 를 보는 데도
 * 서비스 키가 필요해진다 — 무엇을 할 수 있는지 알아보는 일에 자격증명을 요구할 이유가 없다.
 */
const program = new Command()
  .name('medifinder-cli')
  .description('MediFinder 운영 커맨드')
  .addCommand(sitemapCommand(loadConfig));

addExamples(program, [
  'medifinder-cli sitemap build --out ./out',
  'medifinder-cli sitemap upload --from ./out',
]);

// 커맨드 트리를 다 만든 뒤 호출해야 하위 커맨드까지 적용된다.
localizeHelp(program);

program.parseAsync(process.argv).catch((error: unknown) => {
  // 에러 해석은 응용 계층이 한다. CLI 는 출력만 한다.
  console.error(describeError(error));
  process.exitCode = 1;
});
