/**
 * 공공데이터포털 공통 응답 헤더.
 * 정상 코드는 "00" 이다.
 */
export interface KrDataResultHeader {
  resultCode?: string;
  resultMsg?: string;
}

/**
 * 공공데이터포털 응답은 스펙대로 오지 않는 구간이 세 군데 있다.
 * 생성된 타입은 "이상적인" 형태를 가정하므로, 파싱 직후 여기서 실제 형태로 맞춰준다.
 *
 *  1. 결과가 0건이면 `items` 가 객체가 아니라 빈 문자열("")로 온다.
 *  2. 결과가 1건이면 `items.item` 이 배열이 아니라 단일 객체로 온다.
 *  3. `body` 자체가 없는 응답이 있다. (에러 응답 등)
 *
 * 이 함수는 응답 객체를 제자리에서 수정한다. 항상 `items.item` 이 배열이 되도록 보정한다.
 */
export function normalizeKrDataResponse(payload: unknown): void {
  const body = getRecord(getRecord(payload, 'response'), 'body');
  if (!body) {
    return;
  }

  const items = body.items;
  if (!isRecord(items)) {
    // items 가 "" 이거나 null 인 경우 → 0건
    body.items = { item: [] };
    return;
  }

  if (items.item === undefined || items.item === null || items.item === '') {
    items.item = [];
  } else if (!Array.isArray(items.item)) {
    items.item = [items.item];
  }
}

/** 응답 헤더를 꺼낸다. 헤더가 없으면 undefined. */
export function extractResultHeader(
  payload: unknown,
): KrDataResultHeader | undefined {
  const header = getRecord(getRecord(payload, 'response'), 'header');
  return header;
}

function getRecord(
  value: unknown,
  key: string,
): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const child = value[key];
  return isRecord(child) ? child : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
