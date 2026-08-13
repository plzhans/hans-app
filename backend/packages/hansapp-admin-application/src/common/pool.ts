/**
 * 동시 실행 수를 제한하며 순회한다.
 *
 * 개별 조회는 병원당 1콜이라 수천~수만 번 두드린다. 전부 병렬로 날리면 30 TPS 제한에 걸리고,
 * 하나씩 순차로 하면 응답 지연(200~500ms)이 그대로 누적돼 8만 건에 몇 시간이 더 걸린다.
 *
 * 실패는 삼키지 않는다. 한 건이 실패하면 그대로 던져서 배치가 멈추고 sync_state 에 남는다.
 * 이미 받은 병원은 *_synced_at 이 있어 다음 실행에서 건너뛰므로 재시도 비용이 거의 없다.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) {
        return;
      }
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}
