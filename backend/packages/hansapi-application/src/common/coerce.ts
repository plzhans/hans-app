/**
 * 원본 API 값의 타입 강제 변환.
 *
 * 필드 **이름**은 생성 타입(HospitalFullDownItem 등)으로 컴파일 타임에 검증한다.
 * 하지만 **값의 타입**은 믿을 수 없다. 원본이 같은 필드를 문자열/숫자로 섞어서 주기 때문이다.
 * (예: dutyTime1c=2000(숫자), dutyTime6s="0930"(문자열))
 *
 * 그래서 값만 받아 방어적으로 변환한다. 키를 문자열로 넘기지 않으므로
 * 스펙에서 필드가 사라지거나 이름이 바뀌면 호출부가 컴파일 에러로 잡힌다.
 */

/** 문자열로 읽는다. 숫자로 와도 문자열로 맞춘다. 그 외 타입은 값으로 취급하지 않는다. */
export function asString(value: unknown): string | null {
  if (value == null || value === '') {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return null;
}

/** 숫자로 읽는다. 문자열로 와도 숫자로 맞춘다. */
export function asNumber(value: unknown): number | null {
  if (value == null || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}
