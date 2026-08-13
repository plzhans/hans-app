import { KrDataEnvelope, KrDataResultHeader } from '@krdata/core';

/** 정상 처리. */
const RESULT_OK = 'INFO-0';

/**
 * 데이터없음.
 *
 * 가이드의 에러표는 이 상황을 `200 INFO 해당하는 데이터가 없습니다` 로 적었지만
 * 실제 응답은 `INFO-3` / `데이터없음 에러` 다. (2026-08-04 실측)
 *
 * **에러로 다루지 않는다.** 필터에 걸리는 게 없을 때도, 페이지 범위를 넘겼을 때도 이 코드가
 * 온다. 에러로 던지면 페이지네이션 루프가 마지막 페이지에서 터진다.
 */
const RESULT_NO_DATA = 'INFO-3';

/**
 * 행정안전부(게이트웨이 1741000) 응답 봉투.
 *
 * 같은 data.go.kr 인데 심평원·중앙의료원과 세 가지가 다르다. (2026-08-04 실측)
 *
 *   포맷 파라미터  `_type` 이 아니라 `type` 이다. **둘은 결과 봉투가 다르다** —
 *                  `_type=json` 은 게이트웨이가 XML 을 변환한 형태(row 가 1건이면 단일 객체)이고,
 *                  `type=json` 은 부처가 직접 주는 형태(row 가 항상 배열)다. 후자를 쓴다.
 *   성공 코드      '00' 이 아니라 'INFO-0' 이다.
 *   헤더 위치      `response.header` 가 아니라 `<서비스명>[0].head[*].RESULT` 다.
 *                  결과가 없으면 봉투가 통째로 사라지고 최상위 `RESULT` 만 온다.
 *
 * 최상위 키가 서비스명(StanReginCd 등)이라 이름을 박지 않고 **배열인 첫 값**을 봉투로 본다.
 * 이 게이트웨이의 다른 서비스도 같은 형태라 그대로 재사용된다.
 */
export const MOIS_ENVELOPE: KrDataEnvelope = {
  formatParam: { name: 'type', value: 'json' },

  readHeader(payload: unknown): KrDataResultHeader | undefined {
    const root = asRecord(payload);
    if (!root) {
      return undefined;
    }

    // 결과가 없으면 봉투 없이 최상위 RESULT 만 온다.
    const bare = asRecord(root.RESULT);
    if (bare) {
      return bare;
    }

    for (const section of findHeadSections(root)) {
      const result = asRecord(section.RESULT);
      if (result) {
        return result;
      }
    }
    return undefined;
  },

  isSuccess(resultCode: string): boolean {
    return resultCode === RESULT_OK || resultCode === RESULT_NO_DATA;
  },

  /**
   * `row` 가 항상 배열이 되도록 보정한다.
   *
   * `type=json` 이면 1건이어도 배열로 오지만, 결과가 0건이면 **봉투 자체가 없다.**
   * 그 경우 빈 봉투를 만들어 넣어, 읽는 쪽이 존재 여부를 따지지 않게 한다.
   */
  normalize(payload: unknown): void {
    const root = asRecord(payload);
    if (!root) {
      return;
    }

    const sections = findSections(root);
    if (!sections) {
      // 0건. 최상위 RESULT 만 온 응답이라 서비스명 키가 없다 — 우리가 만들어 넣는다.
      root[SYNTHETIC_KEY] = [{ head: [] }, { row: [] }];
      return;
    }

    for (const section of sections) {
      const record = asRecord(section);
      if (!record || !('row' in record)) {
        continue;
      }
      const row = record.row;
      if (row === undefined || row === null || row === '') {
        record.row = [];
      } else if (!Array.isArray(row)) {
        record.row = [row];
      }
    }
  },
};

/**
 * 0건일 때 만들어 넣는 빈 봉투의 키.
 *
 * 원본 응답에는 서비스명 키가 아예 없어서 이름을 알 수 없다. 읽는 쪽(`readRows`)이
 * 키가 아니라 "배열인 값"으로 봉투를 찾으므로 어떤 이름이든 상관없다.
 */
const SYNTHETIC_KEY = '_empty';

/** 봉투(서비스명 키의 2칸 배열)를 찾는다. 없으면 undefined. */
function findSections(root: Record<string, unknown>): unknown[] | undefined {
  for (const value of Object.values(root)) {
    if (Array.isArray(value)) {
      return value as unknown[];
    }
  }
  return undefined;
}

/** 봉투 0번의 head 배열. 없으면 빈 배열. */
function findHeadSections(root: Record<string, unknown>): Record<string, unknown>[] {
  for (const section of findSections(root) ?? []) {
    const head = asRecord(section)?.head;
    if (Array.isArray(head)) {
      return head.map(asRecord).filter((item) => item !== undefined);
    }
  }
  return [];
}

/**
 * 응답에서 행 목록과 페이지 정보를 꺼낸다.
 *
 * 원본 봉투는 위치로만 구분되는 2칸 배열이라(0=head, 1=row) 타입으로는 다룰 수 없다.
 * 클라이언트가 이 함수로 한 번 펴서 내보낸다.
 */
export function readRows<T>(payload: unknown): {
  totalCount: number;
  pageNo: number;
  numOfRows: number;
  rows: T[];
} {
  const root = asRecord(payload) ?? {};
  const sections = findSections(root) ?? [];

  let rows: T[] = [];
  for (const section of sections) {
    const row = asRecord(section)?.row;
    if (Array.isArray(row)) {
      rows = row as T[];
      break;
    }
  }

  // head 는 서로 다른 객체 3개가 든 배열이다. 어느 칸에 있든 값을 찾아 합친다.
  const head: Record<string, unknown> = {};
  for (const section of findHeadSections(root)) {
    Object.assign(head, section);
  }

  return {
    totalCount: toNumber(head.totalCount),
    pageNo: toNumber(head.pageNo),
    numOfRows: toNumber(head.numOfRows),
    rows,
  };
}

/** 페이지 필드는 숫자로도 문자열로도 온다(totalCount 만 숫자다). 숫자로 맞춘다. */
function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
