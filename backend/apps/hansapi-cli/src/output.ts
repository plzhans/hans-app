const COLOR = {
  key: '\x1b[36m', // cyan
  string: '\x1b[32m', // green
  number: '\x1b[33m', // yellow
  boolean: '\x1b[35m', // magenta
  null: '\x1b[90m', // gray
  reset: '\x1b[0m',
} as const;

/**
 * 색을 입혀도 되는지 판단한다.
 * 파이프/리다이렉트로 넘길 때 ANSI 코드가 섞이면 jq 같은 후속 처리가 깨지므로 끈다.
 * NO_COLOR 는 https://no-color.org 관례를 따른다.
 */
function supportsColor(): boolean {
  return process.stdout.isTTY === true && !process.env.NO_COLOR;
}

/** JSON 문자열의 토큰별로 색을 입힌다. */
function colorize(json: string): string {
  // 문자열(뒤에 : 가 오면 키), 숫자, true/false, null 을 각각 잡는다.
  const token =
    /("(?:\\.|[^"\\])*")(\s*:)?|\b(?:true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

  return json.replace(
    token,
    (match, quoted: string | undefined, colon: string | undefined) => {
      if (quoted !== undefined) {
        return colon
          ? `${COLOR.key}${quoted}${COLOR.reset}${colon}`
          : `${COLOR.string}${quoted}${COLOR.reset}`;
      }
      if (match === 'null') {
        return `${COLOR.null}${match}${COLOR.reset}`;
      }
      if (match === 'true' || match === 'false') {
        return `${COLOR.boolean}${match}${COLOR.reset}`;
      }
      return `${COLOR.number}${match}${COLOR.reset}`;
    },
  );
}

/**
 * API 응답을 가공하지 않고 그대로 출력한다.
 * pretty 를 주면 색을 입힌다. 구조나 내용은 바뀌지 않는다.
 */
export function printJson(value: unknown, pretty = false): void {
  const json = JSON.stringify(value, null, 2);
  console.log(pretty && supportsColor() ? colorize(json) : json);
}

/**
 * 응답에서 item 목록만 꺼낸다. (`response.body.items.item`)
 * mutator 가 항상 배열로 정규화해두므로 여기서 형태를 다시 따질 필요는 없다.
 */
function extractItems(response: unknown): Record<string, unknown>[] {
  const items = (
    response as {
      response?: { body?: { items?: { item?: Record<string, unknown>[] } } };
    }
  )?.response?.body?.items?.item;
  return items ?? [];
}

/**
 * 화면상 폭. 한글·한자 등 East Asian Wide 문자는 2칸을 차지한다.
 * console.table 은 이걸 고려하지 않는데다 문자열에 따옴표를 붙여 가독성이 나쁘다.
 */
function displayWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    const isWide =
      (code >= 0x1100 && code <= 0x115f) || // 한글 자모
      (code >= 0x2e80 && code <= 0xa4cf) || // CJK 부수·한자·가나
      (code >= 0xac00 && code <= 0xd7a3) || // 한글 음절
      (code >= 0xf900 && code <= 0xfaff) || // CJK 호환 한자
      (code >= 0xff00 && code <= 0xff60); // 전각 기호
    width += isWide ? 2 : 1;
  }
  return width;
}

/** 표에 넣을 문자열로 바꾼다. 객체가 오면 JSON 으로 접어 넣는다. */
function toCell(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  return String(value);
}

function padRight(text: string, width: number): string {
  return text + ' '.repeat(Math.max(0, width - displayWidth(text)));
}

/** 지정한 컬럼만 표로 출력한다. 조회 결과를 눈으로 확인할 때 쓴다. */
export function printSimple(response: unknown, columns: string[]): void {
  const items = extractItems(response);
  if (items.length === 0) {
    console.log('(결과 없음)');
    return;
  }

  const rows = items.map((item) =>
    columns.map((column) => toCell(item[column])),
  );

  const widths = columns.map((column, i) =>
    Math.max(displayWidth(column), ...rows.map((row) => displayWidth(row[i]))),
  );

  const line = (cells: string[]): string =>
    cells.map((cell, i) => padRight(cell, widths[i])).join('  ');

  console.log(line(columns));
  console.log(widths.map((width) => '─'.repeat(width)).join('  '));
  for (const row of rows) {
    console.log(line(row));
  }
}
