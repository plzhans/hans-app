import { CodeSyncResult } from '@hansapi/admin-application';

/**
 * 코드 sync 결과를 출력한다. HIRA 는 종류가 여러 개라 표로 찍는다.
 *
 * 병원 sync 와 달리 --full 이 없다. 코드는 전량이 수백 건이라 항상 전체를 적재한다.
 */
export function printCodeSyncResult(
  label: string,
  results: CodeSyncResult[],
): void {
  const lines = [`${label} 코드 sync 완료`];

  for (const result of results) {
    const seconds = (result.elapsedMs / 1000).toFixed(1);
    lines.push(
      `  ${result.tp.padEnd(10)} 전체 ${String(result.totalCount).padStart(6)}건` +
        ` / 반영 ${String(result.upserted).padStart(6)}건` +
        ` / 호출 ${result.pages}회 / ${seconds}초`,
    );
  }

  console.log(lines.join('\n'));
}
