/**
 * 날짜/시간 표현 정책:
 * - service(application) 계층과 도메인은 시점을 UTC 기준 Date 객체로 다룬다.
 * - API 응답으로 내보낼 때만 KST(Asia/Seoul, UTC+9) 문자열로 변환한다.
 *   → 내부 로직은 타임존에 오염되지 않고, 외부 계약만 KST 문자열로 고정된다.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * Date(UTC 기준) → KST ISO 문자열(오프셋 포함)로 변환한다.
 * 예) 2026-07-06T00:00:00Z → '2026-07-06T09:00:00+09:00'
 * null/undefined 는 그대로 null 로 반환한다.
 */
export function toKstString(date: Date | null | undefined): string | null {
  if (date == null) {
    return null;
  }
  const shifted = new Date(date.getTime() + KST_OFFSET_MS);
  // shifted 의 UTC 필드가 곧 KST 벽시계 값이므로 getUTC* 로 조립한다.
  const yyyy = shifted.getUTCFullYear();
  const mm = pad2(shifted.getUTCMonth() + 1);
  const dd = pad2(shifted.getUTCDate());
  const hh = pad2(shifted.getUTCHours());
  const mi = pad2(shifted.getUTCMinutes());
  const ss = pad2(shifted.getUTCSeconds());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}+09:00`;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
