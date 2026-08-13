/**
 * 관리자가 고르는 언어·시간대.
 *
 * 관리자 계정은 CLI 로만 만들어져 가입 화면이 없다 — 브라우저에서 값을 받을 자리가 없어서
 * 서버가 한국(ko·Asia/Seoul)으로 만들어 두고, 바꾸는 것은 여기 내정보 화면이다.
 */

/** 지원 언어. 백엔드의 SUPPORTED_LANGS 와 같은 목록이다. */
export const LANGUAGE_OPTIONS = [
  { value: 'ko', label: '한국어' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'zh', label: '中文' },
] as const;

/**
 * 언어 코드를 사람이 읽는 이름으로. **모르는 코드는 그대로 돌려준다** — 고르는 자리와
 * 읽는 자리가 같은 말을 쓰게 하려는 것이지, 값을 감추려는 것이 아니다.
 */
export function languageLabel(code: string): string {
  return LANGUAGE_OPTIONS.find((option) => option.value === code)?.label ?? code;
}

/** 이 브라우저의 IANA 타임존. 못 구하면 undefined. */
export function detectTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/**
 * 선택 목록에 뿌릴 타임존.
 *
 * `Intl.supportedValuesOf` 가 런타임이 실제로 아는 존을 준다 — 우리가 표를 들고 다니면
 * tzdata 가 바뀔 때마다 낡는다. 없는 브라우저에서는 지금 쓰는 존 하나만 남는다.
 */
export function listTimeZones(): string[] {
  // 타입 선언(lib.es2022.intl)에 없는 프로젝트라 여기서 모양만 적어 준다.
  const intl = Intl as typeof Intl & {
    supportedValuesOf?: (key: 'timeZone') => string[];
  };
  try {
    const supported = intl.supportedValuesOf?.('timeZone');
    if (supported?.length) return [...supported];
  } catch {
    // 아래 폴백으로 떨어진다.
  }
  const current = detectTimeZone();
  return current ? [current] : [];
}

/**
 * "Asia/Seoul (GMT+9)" 처럼 보여준다.
 *
 * **오프셋은 저장하지 않고 여기서 계산한다.** 서머타임을 쓰는 지역은 계절에 따라 값이 달라서,
 * 굳혀 두면 반년은 틀린 값을 보여주게 된다.
 */
export function formatTimeZoneLabel(timeZone: string, at = new Date()): string {
  const offset = zonePart(timeZone, 'longOffset', 'en-US', at);
  // "GMT+09:00" → "GMT+9", "GMT+09:30" → "GMT+9:30", "GMT" → "GMT"
  const short = offset?.replace(/([+-])0(\d)/, '$1$2').replace(/:00$/, '');
  return short ? `${timeZone} (${short})` : timeZone;
}

/**
 * 그 지역에서 부르는 이름("한국 표준시"). 검색어가 여기까지 걸린다 —
 * `Asia/Seoul` 을 몰라도 "한국" 으로 찾을 수 있어야 한다.
 *
 * 이름이 없는 존은 Intl 이 오프셋(`GMT+05:00`)을 대신 준다. 그건 라벨에 이미 있는 값이라
 * 두 번 적지 않고 버린다.
 */
export function timeZoneDisplayName(
  timeZone: string,
  at = new Date(),
): string | undefined {
  const name = zonePart(timeZone, 'long', 'ko-KR', at);
  return name && !name.startsWith('GMT') ? name : undefined;
}

function zonePart(
  timeZone: string,
  timeZoneName: 'long' | 'longOffset',
  locale: string,
  at: Date,
): string | null {
  try {
    return (
      new Intl.DateTimeFormat(locale, { timeZone, timeZoneName })
        .formatToParts(at)
        .find((part) => part.type === 'timeZoneName')?.value ?? null
    );
  } catch {
    return null;
  }
}

/**
 * `2026-08-01` 같은 날짜 문자열을 **그 시간대의 하루 경계**로 바꿔 ISO 로 준다.
 *
 * 날짜 입력칸은 시간대가 없는 값(`YYYY-MM-DD`)을 준다. 그대로 `new Date()` 에 넣으면
 * 브라우저 시간대로 해석되는데, 화면의 시각은 계정 시간대로 찍힌다 — 서울 기준으로 보면서
 * 뉴욕 기준으로 걸러지는 어긋남이 생긴다. 경계도 같은 시간대에서 계산한다.
 *
 * `end` 면 그날 23:59:59.999 다(끝을 포함하는 조회라 하루가 통째로 들어온다).
 */
export function zonedDayBoundary(
  date: string,
  edge: 'start' | 'end',
  timeZone: string,
): string {
  const wall = `${date}T${edge === 'end' ? '23:59:59.999' : '00:00:00.000'}Z`;
  const guess = new Date(wall);
  if (Number.isNaN(guess.getTime())) return guess.toISOString();

  /*
    오프셋은 **초 단위로 자른 시각**에서 잰다. Intl 이 밀리초를 안 돌려줘서, 999ms 가 붙은
    끝 경계로 그대로 재면 오프셋이 그만큼 모자라게 나오고 결과가 1초 뒤로 밀린다
    (하루 끝이 다음 날 00:00:00.998 이 된다).
  */
  const whole = new Date(Math.floor(guess.getTime() / 1000) * 1000);
  // 서머타임 전환일의 한두 시간 오차는 감수한다 — 날짜 단위 필터라 결과가 갈리지 않는다.
  return new Date(guess.getTime() - zoneOffsetMs(whole, timeZone)).toISOString();
}

/** 그 순간 그 시간대의 UTC 오프셋(ms). */
function zoneOffsetMs(at: Date, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(at);
    const pick = (type: string) =>
      Number(parts.find((part) => part.type === type)?.value);
    // 그 존의 벽시계 값을 UTC 로 되읽어 원래 순간과의 차이를 본다.
    const asUtc = Date.UTC(
      pick('year'),
      pick('month') - 1,
      pick('day'),
      // 자정을 24시로 주는 런타임이 있다.
      pick('hour') % 24,
      pick('minute'),
      pick('second'),
    );
    return asUtc - at.getTime();
  } catch {
    return 0;
  }
}

export interface TimeZoneOption {
  value: string;
  label: string;
  description?: string;
}

/**
 * 선택 화면에 그대로 넣을 수 있는 목록.
 *
 * **한 번 만들고 재사용한다.** 400여 개마다 Intl 포매터를 두 벌씩 세우는 일이라 첫 계산이
 * 50ms 안팎 걸린다 — 화면을 열 때마다 다시 하면 그만큼 멎어 보인다.
 */
let cachedOptions: TimeZoneOption[] | null = null;

export function timeZoneOptions(): TimeZoneOption[] {
  if (!cachedOptions) {
    const at = new Date();
    cachedOptions = listTimeZones().map((zone) => ({
      value: zone,
      label: formatTimeZoneLabel(zone, at),
      description: timeZoneDisplayName(zone, at),
    }));
  }
  return cachedOptions;
}
