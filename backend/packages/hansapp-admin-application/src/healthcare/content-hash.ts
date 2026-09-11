import { createHash } from 'node:crypto';

/**
 * 빌드 결과의 내용 해시. "이번 회차에 값이 실제로 바뀌었나" 를 판정하는 데 쓴다.
 *
 * 원본(HIRA·NMC)은 수정 시각을 주지 않는다. 우리가 알 수 있는 것은 직전 회차에 만든 값과
 * 이번에 만든 값이 다른지뿐이라, 그 비교를 해시로 한다. 값 전체를 DB 에서 읽어와 비교하면
 * 8만 행의 transport JSON 과 intro TEXT 를 매 회차 끌고 와야 한다 — 해시는 컬럼 하나다.
 *
 * 비교는 언제나 **해시끼리** 한다. 저장된 값과 새로 만든 값을 직접 맞대지 않는다.
 * DECIMAL 반올림이나 드라이버의 타입 변환이 끼어들 자리를 없애려는 것이다.
 */
export function contentHash(value: unknown): string {
  return createHash('md5').update(canonical(value)).digest('hex');
}

/**
 * 해시 입력용 문자열. JSON.stringify 를 쓰지 않는다 — 객체 키 순서가 입력 순서를 그대로
 * 따르고, undefined 가 키째로 사라져서 같은 내용이 다른 문자열이 된다.
 *
 * 배열 순서는 보존한다. 순서가 흔들리는 원본(교통편 등)은 **부르는 쪽이 정렬해서** 넘긴다.
 * 여기서 일괄 정렬하면 순서가 의미를 갖는 값까지 뭉갠다.
 */
function canonical(value: unknown): string {
  // DB 는 undefined 를 모른다. 양쪽 다 NULL 로 저장되므로 같은 글자로 접는다.
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
}
