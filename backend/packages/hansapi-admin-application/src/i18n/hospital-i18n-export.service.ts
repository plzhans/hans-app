import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

import { Injectable, Logger } from '@nestjs/common';
import { Prisma, PrismaService } from '@hansapi/data';

/** 번역 대상 필드. healthcare_hospital_i18n 의 컬럼과 같다. */
export const I18N_FIELDS = [
  'name',
  'intro',
  'notice',
  'directions',
  'park_note',
  'transport',
] as const;

export type I18nField = (typeof I18N_FIELDS)[number];

export function isI18nField(value: string): value is I18nField {
  return (I18N_FIELDS as readonly string[]).includes(value);
}

export interface I18nExportOptions {
  /** 'en' | 'ja' | … 한국어(원문)는 대상이 아니다. */
  lang: string;
  /** 파일을 쓸 디렉토리. */
  outDir: string;
  /** 뽑을 필드. 비우면 전부. */
  fields?: I18nField[];
  /** 앞에서 N 건만. 샘플용. */
  limit?: number;
  /** 번역이 채워진 파일도 덮어쓴다. */
  force?: boolean;
}

export interface I18nExportResult {
  lang: string;
  file: string;
  /** 줄 수 = 번역할 게 하나라도 있는 병원 수 */
  lines: number;
  /** 필드별 번역 대상 건수 */
  fields: Record<string, number>;
  /** 필드별 원문 문자수. 견적의 근거다. */
  chars: Record<string, number>;
  bytes: number;
  elapsedMs: number;
}

/** 한 번에 읽는 병원 수. 8만 행을 한 번에 메모리에 올리지 않는다. */
const CHUNK = 2_000;

/**
 * 번역할 원문을 JSONL 로 뽑는다.
 *
 * **한 줄 = 병원 하나 × 언어 하나**, healthcare_hospital_i18n 의 행 모양 그대로다.
 * 여기에 `ko` 블록으로 **번역할 한국어 원문**을 얹는다. 번역기가 채울 자리(name, intro …)는
 * null 로 비워 둔다.
 *
 * ```json
 * {"hospital_id":18,"lang":"en",
 *  "ko":{"name":"부산제일안과의원","park_note":"진료는 30분 무료"},
 *  "name":null,"park_note":null,
 *  "name_src":"3f2a…","park_note_src":"9c41…",
 *  "engine":null}
 * ```
 *
 * **해시는 MySQL 이 계산한다(MD5(h.name)).** JS 로 md5 를 다시 구하면 안 된다 —
 * 재번역 판정 쿼리도 `i.name_src <> MD5(h.name)` 로 MySQL 이 계산하는데, 양쪽 계산이
 * 한 글자라도 어긋나면 **매 실행마다 전건이 재번역 대상**이 된다. 돈이 무한히 샌다.
 * 계산하는 쪽을 하나로 두면 어긋날 수가 없다. 특히 transport 는 JSON 이라 MySQL 의 직렬화와
 * JSON.stringify 가 애초에 다르다.
 *
 * `CAST(… AS CHAR)` 를 씌우는 이유: 안 씌우면 Prisma 가 MD5 결과를 Bytes 로 보고 Buffer 를 준다.
 * 그대로 JSON.stringify 하면 해시가 `{"0":213,"1":230,…}` 같은 바이트 배열로 파일에 박힌다.
 *
 * **이미 최신 번역이 있는 필드는 ko 에 넣지 않는다.** 원문이 바뀐 것과 아직 안 된 것만 나간다.
 * 그래서 두 번째 실행부터는 파일이 훨씬 작아진다 — 그게 정상이고, 그 숫자가 곧 "얼마나 남았나" 다.
 */
@Injectable()
export class HospitalI18nExportService {
  private readonly logger = new Logger(HospitalI18nExportService.name);

  constructor(private readonly prisma: PrismaService) {}

  async export(options: I18nExportOptions): Promise<I18nExportResult> {
    const started = Date.now();
    const fields = options.fields?.length ? options.fields : [...I18N_FIELDS];

    await mkdir(options.outDir, { recursive: true });
    const file = join(options.outDir, `hospital_i18n_${options.lang}.jsonl`);
    await this.guardOverwrite(file, options.force === true);

    const result: I18nExportResult = {
      lang: options.lang,
      file,
      lines: 0,
      fields: Object.fromEntries(fields.map((f) => [f, 0])),
      chars: Object.fromEntries(fields.map((f) => [f, 0])),
      bytes: 0,
      elapsedMs: 0,
    };

    await pipeline(
      Readable.from(this.lines(options, fields, result)),
      createWriteStream(file),
    );

    result.elapsedMs = Date.now() - started;
    // 출력은 CLI 가 소유한다. 여기서 또 찍으면 같은 경로가 두 번 나온다.
    this.logger.debug(`${options.lang}: ${result.lines}줄 → ${file}`);
    return result;
  }

  /**
   * JSONL 줄을 하나씩 흘려보낸다.
   *
   * 8만 행을 배열로 모아서 한 번에 쓰지 않는다 — intro·notice 가 TEXT 라 통째로 올리면
   * 수백 MB 다. 제너레이터로 흘리고 파일 스트림이 뒤에서 받아 쓴다.
   */
  private async *lines(
    options: I18nExportOptions,
    fields: I18nField[],
    result: I18nExportResult,
  ): AsyncGenerator<string> {
    let cursor = 0;

    for (;;) {
      const rows = await this.chunk(options.lang, cursor);
      if (rows.length === 0) {
        return;
      }
      cursor = Number(rows[rows.length - 1].id);

      for (const row of rows) {
        const line = this.toLine(row, options.lang, fields, result);
        if (!line) {
          continue;
        }

        result.lines += 1;
        const text = `${JSON.stringify(line)}\n`;
        result.bytes += Buffer.byteLength(text);
        yield text;

        if (options.limit && result.lines >= options.limit) {
          return;
        }
      }
    }
  }

  /**
   * 번역이 채워진 파일을 말없이 덮어쓰지 않는다.
   *
   * export 는 파일을 **잘라내고** 다시 쓴다(createWriteStream 의 기본 동작). 그런데 이 파일은
   * 다음 단계의 **결과물이기도 하다** — 번역기가 null 자리를 채워 넣는 바로 그 파일이다.
   * 번역을 다 채워 넣은 뒤 습관적으로 export 를 한 번 더 돌리면 그 작업이 통째로 사라진다.
   * 되돌릴 방법이 없고, 다시 만들려면 돈과 시간을 또 써야 한다.
   *
   * **빈 파일(전부 null)은 그냥 덮는다.** 그건 잃을 게 없는 산출물이고, sync 후 "얼마나 남았나"
   * 를 보려고 export 를 다시 돌리는 건 정상적인 흐름이다. 여기서 막으면 --force 가 습관이 되고,
   * 습관이 되면 정작 막아야 할 때 못 막는다.
   */
  private async guardOverwrite(file: string, force: boolean): Promise<void> {
    if (force || !existsSync(file)) {
      return;
    }

    const filled = await this.firstTranslatedLine(file);
    if (filled === null) {
      return;
    }

    throw new Error(
      [
        `${file} 에 이미 번역이 채워져 있다 (${filled.toLocaleString()}번째 줄).`,
        '덮어쓰면 그 번역이 사라진다. 되돌릴 수 없다.',
        '',
        '  적재했다면  : 먼저 적재하고 다시 뽑아라 (적재된 건 다음 export 에서 빠진다)',
        '  버릴 거라면 : --force',
      ].join('\n'),
    );
  }

  /** 번역이 하나라도 채워진 첫 줄 번호(1-base). 없으면 null. 찾는 즉시 멈춘다. */
  private async firstTranslatedLine(file: string): Promise<number | null> {
    const reader = createInterface({
      input: createReadStream(file),
      crlfDelay: Infinity,
    });

    let lineNo = 0;
    try {
      for await (const line of reader) {
        lineNo += 1;
        if (!line.trim()) {
          continue;
        }

        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(line) as Record<string, unknown>;
        } catch {
          // 우리가 만든 파일이 아니거나 손상됐다. 덮어쓰기 전에 사람이 봐야 한다.
          return lineNo;
        }

        if (I18N_FIELDS.some((field) => parsed[field] != null)) {
          return lineNo;
        }
      }
    } finally {
      reader.close();
    }

    return null;
  }

  /**
   * 번역할 게 하나라도 남은 병원만 읽는다.
   *
   * WHERE 절의 OR 여섯 줄이 곧 "번역 대상" 의 정의다. 이 조건을 서비스 코드가 아니라 SQL 에
   * 둔 이유는 두 번째 실행부터 **네트워크로 안 넘겨도 되는 행을 안 넘기기** 위해서다.
   * 8만 병원 중 실제로 재번역할 게 열 건이면 열 행만 온다.
   *
   * engine='human' 은 사람이 고친 번역이라 건드리지 않는다.
   * attempt_count>=3 은 이미 세 번 실패한 것이다 — 계속 재시도하면 돈만 태운다.
   */
  private async chunk(
    lang: string,
    cursor: number,
  ): Promise<Record<string, unknown>[]> {
    return this.prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT h.id,
             h.name,       CAST(MD5(h.name) AS CHAR)       AS name_md5,
             h.intro,      CAST(MD5(h.intro) AS CHAR)      AS intro_md5,
             h.notice,     CAST(MD5(h.notice) AS CHAR)     AS notice_md5,
             h.directions, CAST(MD5(h.directions) AS CHAR) AS directions_md5,
             h.park_note,  CAST(MD5(h.park_note) AS CHAR)  AS park_note_md5,
             h.transport,  CAST(MD5(h.transport) AS CHAR)  AS transport_md5,
             i.name       AS t_name,       i.name_src,
             i.intro      AS t_intro,      i.intro_src,
             i.notice     AS t_notice,     i.notice_src,
             i.directions AS t_directions, i.directions_src,
             i.park_note  AS t_park_note,  i.park_note_src,
             i.transport  AS t_transport,  i.transport_src
        FROM healthcare_hospital h
        LEFT JOIN healthcare_hospital_i18n i
               ON i.hospital_id = h.id AND i.lang = ${lang}
       WHERE h.status = 'active'
         AND h.id > ${cursor}
         AND COALESCE(i.engine, '') <> 'human'
         AND COALESCE(i.attempt_count, 0) < 3
         AND (
              (h.name       IS NOT NULL AND (i.name       IS NULL OR i.name_src       <> MD5(h.name)))
           OR (h.intro      IS NOT NULL AND (i.intro      IS NULL OR i.intro_src      <> MD5(h.intro)))
           OR (h.notice     IS NOT NULL AND (i.notice     IS NULL OR i.notice_src     <> MD5(h.notice)))
           OR (h.directions IS NOT NULL AND (i.directions IS NULL OR i.directions_src <> MD5(h.directions)))
           OR (h.park_note  IS NOT NULL AND (i.park_note  IS NULL OR i.park_note_src  <> MD5(h.park_note)))
           OR (h.transport  IS NOT NULL AND (i.transport  IS NULL OR i.transport_src  <> MD5(h.transport)))
         )
       ORDER BY h.id
       LIMIT ${CHUNK}
    `);
  }

  /**
   * 행 하나 → JSONL 한 줄. 번역할 게 없으면 null 을 준다(그 줄은 안 쓴다).
   *
   * SQL 의 WHERE 는 "이 병원에 번역할 게 하나라도 있나" 만 본다. **어느 필드인지**는 여기서 가린다 —
   * --fields 로 필드를 좁힐 수 있어야 하고(이름만 먼저 돌리는 게 실제 첫 작업이다),
   * 필드별 대상 수·문자수도 여기서 세야 견적이 나온다.
   */
  private toLine(
    row: Record<string, unknown>,
    lang: string,
    fields: I18nField[],
    result: I18nExportResult,
  ): Record<string, unknown> | null {
    const ko: Record<string, unknown> = {};
    const slots: Record<string, unknown> = {};
    const hashes: Record<string, unknown> = {};

    for (const field of fields) {
      const source = row[field];
      if (source === null || source === undefined) {
        continue;
      }

      // 이미 최신 번역이 있으면 건너뛴다. 원문이 바뀌었으면 해시가 어긋나 여기 걸린다.
      const md5 = row[`${field}_md5`] as string;
      if (row[`t_${field}`] != null && row[`${field}_src`] === md5) {
        continue;
      }

      ko[field] = source;
      slots[field] = null;
      hashes[`${field}_src`] = md5;

      result.fields[field] += 1;
      result.chars[field] += this.charsOf(source);
    }

    if (Object.keys(ko).length === 0) {
      return null;
    }

    return {
      hospital_id: Number(row.id),
      lang,
      ko,
      ...slots,
      ...hashes,
      engine: null,
    };
  }

  /** 견적용 문자수. transport 는 JSON 이라 직렬화 길이로 센다(정확할 필요는 없고 규모만 알면 된다). */
  private charsOf(value: unknown): number {
    if (typeof value === 'string') {
      return value.length;
    }
    return JSON.stringify(value).length;
  }
}
