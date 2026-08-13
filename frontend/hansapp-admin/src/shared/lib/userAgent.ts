/**
 * user agent 문자열에서 브라우저·운영체제를 읽어낸다.
 *
 * **어림짐작이다.** UA 는 규격이 아니라 관행이고, 크롬은 사파리인 척, 엣지는 크롬인 척
 * 하는 문자열을 보낸다. 그래서 화면에서는 이 값을 원문과 **함께** 보여 준다 — 요약이
 * 틀려도 원문이 옆에 있으면 사람이 바로잡아 읽는다.
 *
 * 라이브러리를 붙이지 않은 것은 쓰는 자리가 목록 한 줄뿐이고, 정확도가 올라가도 이
 * 화면이 답하는 질문("낯선 기기가 있나")이 달라지지 않아서다.
 */

/** 앞에 있는 것이 먼저 잡힌다 — 엣지·웨일은 UA 에 Chrome 도 함께 담는다. */
const BROWSERS: [name: string, pattern: RegExp][] = [
  ['Edge', /Edg(?:e|A|iOS)?\/(\d+)/],
  ['Opera', /OPR\/(\d+)/],
  ['Samsung Internet', /SamsungBrowser\/(\d+)/],
  ['Whale', /Whale\/(\d+)/],
  ['Firefox', /(?:Firefox|FxiOS)\/(\d+)/],
  ['Chrome', /(?:Chrome|CriOS)\/(\d+)/],
  ['Safari', /Version\/(\d+)[.\d]* Safari/],
];

/** 기기 요약. 못 알아본 조각은 null 이다. */
export interface DeviceInfo {
  /** 예: `Chrome 126`. 못 알아보면 null. */
  browser: string | null;
  /** 예: `Windows`, `iOS 17`. 못 알아보면 null. */
  os: string | null;
}

export function describeUserAgent(
  userAgent: string | null | undefined,
): DeviceInfo {
  if (!userAgent) return { browser: null, os: null };
  return { browser: readBrowser(userAgent), os: readOs(userAgent) };
}

/**
 * 한 줄로 합친 이름. 예: `Chrome 126 · macOS`.
 *
 * 둘 다 못 알아보면 null 이다 — 그때 화면은 UA 원문을 그대로 보여 준다.
 */
export function deviceLabel(userAgent: string | null | undefined): string | null {
  const { browser, os } = describeUserAgent(userAgent);
  const parts = [browser, os].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

function readBrowser(userAgent: string): string | null {
  for (const [name, pattern] of BROWSERS) {
    const matched = pattern.exec(userAgent);
    if (matched) return `${name} ${matched[1]}`;
  }
  return null;
}

function readOs(userAgent: string): string | null {
  // 아이패드 사파리는 데스크톱 모드에서 Macintosh 로 온다. 여기서는 가릴 수 없다.
  if (/iPhone|iPad|iPod/.test(userAgent)) {
    const version = /OS (\d+)[_\d]*/.exec(userAgent);
    return version ? `iOS ${version[1]}` : 'iOS';
  }
  if (/Android/.test(userAgent)) {
    const version = /Android (\d+)/.exec(userAgent);
    return version ? `Android ${version[1]}` : 'Android';
  }
  /*
    윈도우는 판을 적지 않는다. UA 가 보내는 `Windows NT 10.0` 은 10 과 11 이 같은 값이라,
    숫자를 붙이면 11 을 10 이라고 우기는 줄이 생긴다.
  */
  if (/Windows NT/.test(userAgent)) return 'Windows';
  if (/Mac OS X/.test(userAgent)) return 'macOS';
  if (/CrOS/.test(userAgent)) return 'ChromeOS';
  if (/Linux/.test(userAgent)) return 'Linux';
  return null;
}
