/**
 * 한국 병원 원본 데이터의 자유 텍스트 시간 표기를 구조화한다.
 * 원본은 "오후1시~오후2시", "13시00분~14시00분", "12:30~13:30", "13시~14시(수요일 휴진)"
 * 처럼 포맷이 제각각이라, best-effort 로 파싱하되 **원문(raw)을 항상 보존**한다.
 * 이 파서는 API 응답뿐 아니라 동기화/admin(구조화·역변환)에서도 재사용한다.
 */

/** 파싱된 시간 범위. start/end 는 "HH:MM"(못 뽑으면 null), raw 는 원문. */
export interface TimeRange {
  start: string | null;
  end: string | null;
  raw: string | null;
}

/**
 * 단일 시간 토큰을 "HH:MM" 으로 정규화한다. 못 뽑으면 null.
 * 지원: "0900", "09:00", "9시", "9시30분", "9시00분", "오전9시", "오후1시", "13시".
 * 주의: 오전/오후 표기가 없는 "1:00" 같은 값은 그대로 01:00 으로 본다(문맥상 오후여도 알 수 없음 → raw 로 보존).
 */
export function parseTimeToken(input: string | null): string | null {
  if (input == null) return null;
  let s = input.trim();
  if (s === '') return null;

  let pm = false;
  let am = false;
  if (s.startsWith('오후')) {
    pm = true;
    s = s.slice(2).trim();
  } else if (s.startsWith('오전')) {
    am = true;
    s = s.slice(2).trim();
  }

  let h: number;
  let m = 0;
  let match: RegExpMatchArray | null;
  if ((match = s.match(/^(\d{1,2})\s*시\s*(?:(\d{1,2})\s*분)?/))) {
    h = Number(match[1]);
    m = match[2] ? Number(match[2]) : 0;
  } else if ((match = s.match(/^(\d{1,2}):(\d{2})$/))) {
    h = Number(match[1]);
    m = Number(match[2]);
  } else if ((match = s.match(/^(\d{2})(\d{2})$/))) {
    h = Number(match[1]);
    m = Number(match[2]);
  } else if ((match = s.match(/^(\d{1,2})$/))) {
    h = Number(match[1]);
  } else {
    return null;
  }

  if (h > 24 || m > 59) return null;
  if (pm && h < 12) h += 12;
  if (am && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * "12:30~13:30" 류 범위 문자열을 {start, end} 로 파싱한다.
 * 괄호 안 안내(예: "(수요일 휴진)")는 파싱에서 제외하되 raw 에는 원문을 그대로 남긴다.
 * 못 뽑아도 raw 는 항상 보존되므로 downstream(admin)에서 보정할 수 있다.
 */
export function parseTimeRange(input: string | null): TimeRange {
  if (input == null || input.trim() === '') {
    return { start: null, end: null, raw: null };
  }
  const raw = input.trim();
  const cleaned = raw.replace(/\(.*?\)/g, ' ').trim();
  const parts = cleaned.split(/\s*[~-]\s*/);
  if (parts.length >= 2) {
    return {
      start: parseTimeToken(parts[0]),
      end: parseTimeToken(parts[1]),
      raw,
    };
  }
  return { start: parseTimeToken(cleaned), end: null, raw };
}
