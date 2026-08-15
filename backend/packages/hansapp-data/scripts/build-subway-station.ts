/**
 * 지하철역 사전 생성기. 엑셀 → src/reference/subway-station.data.json
 *
 * orval 과 같은 취급이다. **생성물(json)은 커밋하고, 손으로 고치지 않는다.**
 * 원본이 갱신되면(연 1~2회) 새 엑셀을 backend/data 에 넣고 이 스크립트를 다시 돌린다.
 *
 *   pnpm --filter @hansapp/data codegen:subway
 *
 * [원본] backend/data/전국 도시광역철도 역사 역사정보_*.xlsx
 *   국가철도공단 표준데이터(공공데이터포털 15013205). 전국 1,108역.
 *   https://www.data.go.kr/data/15013205/standard.do
 *
 * [왜 서울열린데이터광장 API 가 아닌가]
 *   그쪽은 수도권 799역뿐이라 부산·대구·대전·광주가 통째로 빠진다. 병원 하차역 578개 기준
 *   이 엑셀이 못 채우는 걸 서울 API 가 채워주는 건 3역뿐이다. 소스를 둘로 유지하면 표기 체계만
 *   갈라진다. (@seouldata/subway 는 껍데기로만 남겨 뒀다 — clients/README.md 참고)
 */
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';

import { normalizeStationName } from '../src/reference/subway-station-name';

const DATA_DIR = join(__dirname, '../../../data');

/**
 * 원본 파일 이름 꼴. **공공데이터포털이 주는 그대로다** — 번역하거나 바꾸면 못 찾는다.
 *
 * 오류 메시지에 이 값을 끼워 넣으려고 상수로 뺐다. 메시지 자체는 영어로 쓰되(규칙),
 * 찾으라는 파일 이름은 실제 이름이어야 도움이 된다.
 */
const SOURCE_FILE_PATTERN = '전국 도시광역철도 역사 역사정보_*.xlsx';

/** 원본 파일을 고르는 조각. 위 이름의 일부다. */
const SOURCE_FILE_KEYWORD = '철도';
const OUT_PATH = join(__dirname, '../src/reference/subway-station.data.json');

/** 일본어 칸이 비었다고 봐야 하는 값. 대구교통공사 94역이 문자열 '없음' 으로 온다. */
const EMPTY_MARKERS = new Set(['', '-', '없음', 'N/A']);

interface StationRow {
  ko: string;
  en: string | null;
  ja: string | null;
  lines: string[];
}

/**
 * 출처·버전. **엑셀 안의 '데이터 기준일자' 컬럼은 쓰지 않는다.**
 *
 * 그 컬럼은 행마다 다르고(85종) 형식도 제각각이다 —
 *   20260531 · 2023.12.15 · 2023-05-15 00:00:00 · 2026.1.23. · 빈칸
 * 역 하나가 언제 갱신됐는지를 적은 값이라 데이터셋 전체의 버전이 아니다.
 * 데이터셋의 버전은 **파일명 끝의 날짜**(_20260701)뿐이고, 그게 배포일이다.
 */
interface SourceInfo {
  provider: string;
  dataset: string;
  file: string;
  version: string;
}

/**
 * 셀에서 문자열을 꺼낸다.
 *
 * **`cell.value` 가 아니라 `cell.text` 를 써야 한다.** 서식이 섞인 셀은 value 가
 * `{ richText: [...] }` 객체로 오고, String() 을 씌우면 '[object Object]' 가 된다.
 * 실제로 남영·충렬사 두 역이 이렇게 뭉개져 사전에서 사라졌었다. text 는 그걸 평탄화해 준다.
 *
 * 값 자체도 지저분하다. ' クムナムロサガ'(앞 공백), 'ヤクス '(뒤 공백), 'キョデ'+nbsp,
 * 'クリ\n(クリジョントンシジャン)'(줄바꿈) 같은 게 23행 섞여 있다.
 * 첫 replace 의 인자는 nbsp(U+00A0) 다. 일반 공백이 아니다 — 지우지 마라.
 */
function clean(value: unknown): string {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function emptyToNull(value: string): string | null {
  return EMPTY_MARKERS.has(value) ? null : value;
}

function findExcel(): string {
  const files = readdirSync(DATA_DIR).filter(
    (f) => f.includes(SOURCE_FILE_KEYWORD) && f.endsWith('.xlsx'),
  );
  if (files.length === 0) {
    throw new Error(`Spreadsheet not found: ${DATA_DIR}/${SOURCE_FILE_PATTERN}`);
  }
  // 파일명 끝에 배포일자가 붙는다(_20260701). 사전순 최신이 최신 데이터다.
  return join(DATA_DIR, files.sort().reverse()[0]);
}

/**
 * 파일명에서 버전(배포일자)을 뽑는다. '..._20260701.xlsx' → '20260701'
 *
 * **없으면 실패시킨다.** 버전을 모르는 채로 사전을 구우면, 나중에 "이게 언제 데이터지?" 를
 * 아무도 답할 수 없게 된다. 파일명을 고쳐서 다시 돌리는 게 맞다.
 */
function versionOf(file: string): string {
  const match = /_(\d{8})\.xlsx$/.exec(file);
  if (!match) {
    throw new Error(
      `Could not read the release date from the file name: ${file}\n` +
        `Expected '..._YYYYMMDD.xlsx'. Keep the file exactly as downloaded — do not rename it.`,
    );
  }
  return match[1];
}

async function main(): Promise<void> {
  const path = findExcel();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);

  const sheet = workbook.worksheets[0];
  const header: Record<string, number> = {};
  sheet.getRow(1).eachCell((cell, col) => {
    header[clean(cell.text)] = col;
  });

  const required = ['역명(한글)', '역명(영어)', '역명(일본어)', '운영노선'];
  for (const name of required) {
    if (!header[name]) {
      throw new Error(
        `Column '${name}' is missing from the spreadsheet. Check whether the source layout changed.`,
      );
    }
  }

  const stations = new Map<string, StationRow>();

  for (let i = 2; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    const rawName = clean(row.getCell(header['역명(한글)']).text);
    if (!rawName) {
      continue;
    }

    const ko = normalizeStationName(rawName);
    let station = stations.get(ko);
    if (!station) {
      station = { ko, en: null, ja: null, lines: [] };
      stations.set(ko, station);
    }

    // 같은 역이 노선마다 행이 따로 나오고 표기가 미묘하게 다르다. 먼저 나온 값을 쓴다.
    // **어느 표기가 옳은지 우리가 판정하지 않는다** — 정부 표기를 그대로 존중한다.
    station.en ??= emptyToNull(clean(row.getCell(header['역명(영어)']).text));
    station.ja ??= emptyToNull(clean(row.getCell(header['역명(일본어)']).text));

    const line = clean(row.getCell(header['운영노선']).text);
    if (line && !station.lines.includes(line)) {
      station.lines.push(line);
    }
  }

  const sorted = [...stations.values()].sort((a, b) => a.ko.localeCompare(b.ko, 'ko'));
  const file = path.split('/').pop() as string;

  // 배열이 아니라 봉투로 굽는다. **출처와 버전이 데이터와 같은 파일에 붙어 있어야** 한다 —
  // 따로 관리하면 사전만 갈아끼우고 버전을 안 고치는 날이 반드시 온다.
  const source: SourceInfo = {
    provider: '국가철도공단',
    dataset: '전국 도시광역철도 역사정보',
    file,
    version: versionOf(file),
  };
  writeFileSync(OUT_PATH, `${JSON.stringify({ source, stations: sorted }, null, 1)}\n`, 'utf8');

  const withJa = sorted.filter((s) => s.ja).length;
  console.log(`${file}  (version ${source.version})`);
  console.log(
    `  → ${sorted.length}역 (en ${sorted.filter((s) => s.en).length} / ja ${withJa}, ja 결손 ${sorted.length - withJa})`,
  );
  console.log(`  → ${OUT_PATH.split('/').slice(-2).join('/')}`);
}

void main();
