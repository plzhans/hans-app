import { join } from 'node:path';

import { Command, InvalidArgumentError } from 'commander';
import { ConfigSource, findRootDir } from '@hansapi/common';
import {
  HospitalI18nExportService,
  I18N_FIELDS,
  isI18nField,
  type I18nField,
  type I18nExportResult,
} from '@hansapi/admin-application';

import { withI18nContext } from '../context';
import { addExamples } from '../help';

/**
 * 번역할 언어. 한국어는 원문이라 대상이 아니다.
 * healthcare_hospital_i18n.lang 은 VARCHAR(10) 이라 나중에 'zh-CN' 을 늘려도 DB 는 안 바뀐다.
 */
const LANGS = ['en', 'ja'] as const;

/**
 * 기본 출력 경로.
 *
 *   개발   backend/temp/    __dirname 에서 마커(pnpm-workspace.yaml)로 찾는다 — 어디서 실행하든 같다.
 *   배포   <배포루트>/temp/  번들엔 마커가 없다. cwd 가 곧 배포 루트다(실행 래퍼가 맞춰 준다).
 *
 * **rootDir 을 쓰면 안 된다.** 그건 못 찾으면 던진다. 이 값은 모듈 로드 시점에 계산되므로
 * 던지는 순간 `--out` 을 쓰지도 않는 커맨드(db, sync …)까지 전부 뜨지 못한다.
 * 실제로 서버에 올린 CLI 가 그렇게 죽었다.
 */
function defaultOut(): string {
  return join(findRootDir(__dirname) ?? process.cwd(), 'temp');
}

export function i18nCommand(source: ConfigSource): Command {
  const i18n = new Command('i18n').description('병원 자유 텍스트 번역');

  addExamples(
    i18n
      .command('export')
      .description(
        '번역할 원문을 JSONL 로 뽑는다. 이미 최신 번역이 있는 필드는 빠진다',
      )
      .option(
        '--lang <langs>',
        `대상 언어. 쉼표로 여러 개. ${LANGS.join(' | ')}`,
        parseLangs,
        [...LANGS],
      )
      .option(
        '--fields <fields>',
        `대상 필드. 쉼표로 여러 개. 기본은 전부.\n                         ${I18N_FIELDS.join(' | ')}`,
        parseFields,
      )
      .option('--limit <n>', '앞에서 N 건만. 샘플 확인용', (value) =>
        positiveInt(value, '--limit'),
      )
      .option('--out <dir>', '출력 디렉토리', defaultOut())
      .option(
        '--force',
        '번역이 채워진 파일도 덮어쓴다. 기본은 거부한다 — 그 파일이 다음 작업의 결과물이다',
      )
      .action(
        async (options: {
          lang: string[];
          fields?: I18nField[];
          limit?: number;
          out: string;
          force?: boolean;
        }): Promise<void> => {
          const results = await withI18nContext(source, async (context) => {
            const service = context.get(HospitalI18nExportService);
            const out: I18nExportResult[] = [];
            // 언어별로 순차 실행한다. 같은 DB 를 두 번 훑는 건 몇 초라 병렬로 얻을 게 없고,
            // 진행 로그가 뒤섞이면 읽기만 나빠진다.
            for (const lang of options.lang) {
              out.push(
                await service.export({
                  lang,
                  outDir: options.out,
                  fields: options.fields,
                  limit: options.limit,
                  force: options.force,
                }),
              );
            }
            return out;
          });

          report(results);
        },
      ),
    [
      'hansapi-cli i18n export                          # en, ja 전부',
      'hansapi-cli i18n export --lang en --fields name  # 영문 병원명만',
      'hansapi-cli i18n export --limit 200              # 샘플 200건',
      'hansapi-cli i18n export --force                  # 번역이 채워진 파일도 덮어쓴다',
    ],
  );

  return i18n;
}

/**
 * 결과 출력.
 *
 * **문자수를 필드별로 낸다.** 번역 비용은 문자수에 비례하는데, 이 프로젝트는 아직 운영키를 못 받아
 * 텍스트가 일부만 들어와 있다. 그래서 총량을 미리 잡을 수 없다 — 매번 실행 시점에 재서 보여준다.
 * 여기 찍힌 숫자가 곧 견적의 근거다.
 */
function report(results: I18nExportResult[]): void {
  for (const r of results) {
    const seconds = (r.elapsedMs / 1000).toFixed(1);
    console.log(`\n[${r.lang}] ${r.file}`);
    console.log(
      `  ${r.lines.toLocaleString()}줄 · ${mib(r.bytes)} · ${seconds}s`,
    );

    const fields = Object.keys(r.fields).filter((f) => r.fields[f] > 0);
    if (fields.length === 0) {
      console.log('  번역할 게 없다. 전부 최신이다.');
      continue;
    }

    let items = 0;
    let chars = 0;
    for (const field of fields) {
      const count = r.fields[field];
      const size = r.chars[field];
      items += count;
      chars += size;
      console.log(
        `    ${field.padEnd(11)} ${count.toLocaleString().padStart(8)}건 ${size.toLocaleString().padStart(10)}자`,
      );
    }
    console.log(
      `    ${'합계'.padEnd(10)} ${items.toLocaleString().padStart(8)}건 ${chars.toLocaleString().padStart(10)}자`,
    );
  }

  // 파일 경로를 맨 끝에 다시 모은다. 언어가 여러 개면 위쪽 블록이 스크롤로 밀려서
  // "그래서 파일이 어디 생겼나" 를 다시 찾아 올라가야 한다.
  console.log('\n생성된 파일');
  for (const r of results) {
    console.log(`  ${r.file}`);
  }
}

function mib(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

function parseLangs(value: string): string[] {
  const langs = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const lang of langs) {
    if (lang === 'ko') {
      throw new InvalidArgumentError(
        'ko 는 원문이라 번역 대상이 아니다. 병원 테이블에 이미 있다',
      );
    }
    if (!(LANGS as readonly string[]).includes(lang)) {
      throw new InvalidArgumentError(
        `${lang} 은 아직 지원하지 않는다. ${LANGS.join(' | ')} 중에서 고르라`,
      );
    }
  }

  if (langs.length === 0) {
    throw new InvalidArgumentError('언어를 하나는 지정하라');
  }
  return langs;
}

function parseFields(value: string): I18nField[] {
  const fields = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const field of fields) {
    if (!isI18nField(field)) {
      throw new InvalidArgumentError(
        `${field} 은 번역 대상 필드가 아니다. ${I18N_FIELDS.join(' | ')} 중에서 고르라`,
      );
    }
  }

  if (fields.length === 0) {
    throw new InvalidArgumentError('필드를 하나는 지정하라');
  }
  return fields as I18nField[];
}

function positiveInt(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError(`${flag} 은 1 이상의 정수여야 한다`);
  }
  return parsed;
}
