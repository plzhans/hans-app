import type { ConfigSource } from './config-source';

/**
 * 추적 헤더(`sentry-trace` · `baggage`)를 붙일 대상.
 *
 * **이 값을 주지 않으면 SDK 는 나가는 모든 요청에 헤더를 붙인다.** 남의 API 에도 붙는다는
 * 뜻이고, 그쪽이 표준 헤더를 걸러내지 않는다는 보장은 없다. 실제로 공공데이터포털은
 * 헤더 값에 `environment=` 이 들어 있으면 400 을 낸다 — `baggage` 의 첫 항목이 그 모양이라
 * data.go.kr 호출이 전부 실패했다. (2026-09 실측)
 *
 * 붙일 이유가 있는 곳은 우리 서비스뿐이다. 받는 쪽 SDK 가 이 헤더를 읽어 트레이스를 이어
 * 붙이기 때문이다. 그 밖으로는 우리 배포 버전과 커밋까지 실려 나갈 뿐 얻는 것이 없다.
 *
 * ## 빈 배열과 미설정은 다르다
 *
 * `[]` 는 "어디에도 안 붙임" 이고 `undefined` 는 "전부 붙임" 이다. 정반대다. 그래서 이 함수는
 * **언제나 배열을 돌려준다.** 설정이 비어 있으면 빈 배열이 나가고 헤더는 아무 데도 붙지 않는다.
 * 안전한 쪽으로 넘어지는 것이 맞다 — 새어 나가는 것보다 트레이스가 끊기는 편이 낫다.
 */
export function buildTracePropagationTargets(source: ConfigSource): RegExp[] {
  return source.getStringArray(TRACE_TARGETS_PATH).map(toHostPattern);
}

const TRACE_TARGETS_PATH = 'sentry.tracePropagationTargets';

/**
 * 호스트 이름 하나를 URL 앞머리에 고정한 정규식으로 만든다.
 *
 * **앞을 고정하지 않으면 주소 어디에 스쳐도 걸린다.** Sentry 는 문자열을 주면 URL 에 그 조각이
 * 들어 있기만 해도 맞다고 보므로, `plzhans.com` 을 그대로 넘기면
 * `https://example.com/?ref=plzhans.com` 같은 남의 주소에도 헤더가 붙는다.
 *
 * 하위 도메인은 받는다. `plzhans.com` 하나로 `api.plzhans.com` 과 `admin.plzhans.com` 이
 * 함께 걸린다 — 도메인이 늘 때마다 설정을 고치지 않게 하려는 것이다.
 */
function toHostPattern(host: string): RegExp {
  const escaped = host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^https?://([a-z0-9-]+\\.)*${escaped}(:\\d+)?(/|$)`, 'i');
}
