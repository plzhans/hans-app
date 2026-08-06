import type { ConfigSource } from '@hansapp/common';

/**
 * 도메인 이벤트가 지나는 큐 이름. **발행자와 소비자가 같은 값을 봐야 한다.**
 *
 * 이벤트마다 큐를 나누지 않는다 — 종류가 늘 때마다 큐·워커가 함께 늘고, 어느 이벤트가
 * 어느 큐에 있는지를 사람이 관리하게 된다. 큐는 하나 두고 **잡 이름으로** 이벤트를 가른다.
 */
export const EVENT_QUEUE_NAME = 'domain-events';

/** 큐가 붙을 Redis 주소. 없으면 큐를 만들지 않는다(발행은 조용히 버려진다 — 아래 주석 참고). */
export function readRedisUrl(source: ConfigSource): string | undefined {
  return source.getUrlOrDefault('redis.url') || undefined;
}
