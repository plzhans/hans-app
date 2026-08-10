/**
 * 브라우저에서 뽑는 지역 설정.
 *
 * 가입할 때 한 번 보내면 서버가 좁혀서 저장한다. **국가는 보내지 않는다** —
 * 브라우저가 국가를 알려 주지 않아서, 서버가 타임존에서 되짚는다.
 *
 * 값을 못 구해도 가입은 그대로 진행된다. 없으면 없는 대로 두고, 나중에 설정 화면에서 고른다.
 */

/** 지원 언어. 백엔드의 SUPPORTED_LANGS 와 같은 목록이다. */
export const LANGUAGE_OPTIONS = [
  { value: 'ko', label: '한국어' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'zh', label: '中文' },
] as const;

export interface ClientLocale {
  language?: string;
  timeZone?: string;
}

/** 이 브라우저의 IANA 타임존. 못 구하면 undefined. */
export function detectTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/** 이 브라우저의 언어 태그(BCP-47). 서버가 지원 언어로 좁힌다. */
export function detectLanguage(): string | undefined {
  return navigator.language || undefined;
}

/**
 * 선택 화면의 기본값으로 쓸 지원 언어.
 *
 * `navigator.language` 는 우리가 지원하지 않는 언어일 수 있다(`fr` 등). 그대로 두면
 * 선택이 빈칸이 되고, 그 상태로 저장하면 서버가 거절한다 — 목록 안의 값으로 떨어뜨린다.
 */
export function detectSupportedLanguage(): string {
  const tag = detectLanguage()?.toLowerCase().split('-')[0];
  const matched = LANGUAGE_OPTIONS.find((option) => option.value === tag);
  return matched?.value ?? 'ko';
}

/** 가입 요청에 실어 보낼 값. 둘 다 못 구했으면 undefined 를 줘서 항목 자체를 뺀다. */
export function detectClientLocale(): ClientLocale | undefined {
  const language = detectLanguage();
  const timeZone = detectTimeZone();
  if (!language && !timeZone) return undefined;
  return { language, timeZone };
}

/**
 * 선택 화면에 뿌릴 타임존 목록.
 *
 * `Intl.supportedValuesOf` 가 런타임이 실제로 아는 존을 준다 — 우리가 표를 들고 다니면
 * tzdata 가 바뀔 때마다 낡는다. 없는 브라우저에서는 지금 쓰는 존 하나만 남긴다
 * (고를 수 없을 뿐, 화면이 깨지지는 않는다).
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
 * 타임존을 "Asia/Seoul (GMT+9)" 처럼 보여준다.
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
 * 선택 화면에 그대로 넣을 수 있는 목록.
 *
 * **한 번 만들고 재사용한다.** 400여 개마다 Intl 포매터를 두 벌씩 세우는 일이라 첫 계산이
 * 50ms 안팎 걸린다 — 화면을 열 때마다 다시 하면 그만큼 멎어 보인다. 오프셋이 서머타임으로
 * 바뀌어도 이 정도 표기는 다음 방문에 맞으면 된다.
 */
let cachedOptions: TimeZoneOption[] | null = null;

export interface TimeZoneOption {
  value: string;
  label: string;
  description?: string;
}

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
