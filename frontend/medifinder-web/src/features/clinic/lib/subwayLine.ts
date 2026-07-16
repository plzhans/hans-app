/**
 * 지하철 노선색.
 *
 * 심평원 노선 칸은 **자유 입력이다.** dev DB 2,567개 토큰을 세어 보면 "1호선" 같은 정상값이
 * 대부분이지만 "인천지하철1호선", "국철1호선", "2호전"(오타), "5호선장한평역", "1번출구" 까지 온다.
 * 그래서 원문을 그대로 키로 쓰면 안 되고, 정규화를 거쳐 찾고 **못 찾으면 회색으로 물러난다.**
 * 틀린 색은 색이 없는 것보다 나쁘다 — 승객은 색을 보고 갈아탄다.
 *
 * **색은 도시마다 다르다.** 이게 이 파일이 도시를 가르는 유일한 이유다.
 * 부산 병원의 "1호선" 은 부산 1호선(주황)이지 서울 1호선(남색)이 아니다. 그런데 원본은
 * 지역을 안 적는다 — 지역 없이 "N호선" 만 적힌 행이 380건(약 15%)이고 그중 284건이 부산이다.
 * 도시는 노선 칸이 아니라 **병원 주소**로 판별할 수밖에 없다.
 */

/** 노선색 팔레트를 가진 도시. 도시철도가 있고 색 체계가 독립인 곳만 있다. */
export type MetroCity = 'capital' | 'busan' | 'daegu' | 'daejeon' | 'gwangju';

/**
 * 노선 → 배경색(hex). **글자색은 두지 않는다** — 언제나 흰색이다.
 *
 * 9호선(#BDB092)·대구3호선(#FFB100)처럼 밝은 노선은 흰 글자 대비가 2:1 남짓이라 WCAG 기준엔
 * 못 미친다. 그래도 흰색으로 가는 건 **노선색 표기가 곧 신호 체계**여서다 — 공식 노선도·
 * 네이버·카카오가 모두 전 노선 흰 글자다. 여기서만 9호선 글자를 검게 하면 그 알약은
 * "다른 무언가" 로 읽힌다. 알약이 작아 색 자체가 식별자고 글자는 확인용이다.
 */
type LinePalette = Record<string, string>;

/** 수도권(서울·경기·인천). 서울교통공사·국가철도공단 공식색. */
const CAPITAL: LinePalette = {
  '1호선': '#0052A4',
  '2호선': '#00A84D',
  '3호선': '#EF7C1C',
  '4호선': '#00A5DE',
  '5호선': '#996CAC',
  '6호선': '#CD7C2F',
  '7호선': '#747F00',
  '8호선': '#E6186C',
  '9호선': '#BDB092',
  경의중앙선: '#77C4A3',
  // 분당선·수인선은 2020년 수인분당선으로 합쳐졌다. 원본엔 옛 이름이 남아 있지만(ALIASES)
  // 노선은 하나이므로 색표에도 하나만 둔다.
  수인분당선: '#FABE00',
  신분당선: '#D31145',
  인천1호선: '#7CA8D5',
  인천2호선: '#ED8B00',
  경춘선: '#0C8E72',
  경강선: '#003DA5',
  서해선: '#8FC31F',
  공항철도: '#0090D2',
  우이신설선: '#B0CE18',
  신림선: '#6789CA',
  김포골드라인: '#A17800',
  에버라인: '#6FB245',
  의정부경전철: '#FDA600',
  'GTX-A': '#9A6292',
};

/** 부산(+김해). 부산교통공사 공식색. */
const BUSAN: LinePalette = {
  '1호선': '#F06A00',
  '2호선': '#81BF48',
  '3호선': '#BB8C00',
  '4호선': '#217DCB',
  동해선: '#0054A6',
  부산김해선: '#8652A1',
};

/** 대구(+경산). 대구교통공사 공식색. */
const DAEGU: LinePalette = {
  '1호선': '#D93F5C',
  '2호선': '#00A84D',
  '3호선': '#FFB100',
  대경선: '#0075C8',
};

/**
 * 대전·광주. 각각 1호선 하나뿐이다.
 * 두 도시 색이 같은 초록인 건 오타가 아니라 받은 색표가 그렇다 — 확인 후 갈라질 수 있다.
 */
const DAEJEON: LinePalette = {
  '1호선': '#5CB85C',
};
const GWANGJU: LinePalette = {
  '1호선': '#5CB85C',
};

const PALETTES: Record<MetroCity, LinePalette> = {
  capital: CAPITAL,
  busan: BUSAN,
  daegu: DAEGU,
  daejeon: DAEJEON,
  gwangju: GWANGJU,
};

/**
 * 시도 이름 → 도시. 주소 첫 낱말로 본다.
 *
 * **노선은 시도 경계를 넘는다** — 도시철도가 없는 시도가 목록에 있는 건 그래서다.
 * 충남(천안·아산)은 수도권 1호선 종점이고, 경남(양산)은 부산 2호선, 경남(김해)은
 * 부산김해선이 지난다. 울산도 도시철도는 없지만 동해선이 부산에서 올라온다.
 * 여기 없는 시도(강원·제주 등)는 undefined — 색을 칠하지 않는다.
 */
const CITY_BY_SIDO: [RegExp, MetroCity][] = [
  [/^(서울|경기|인천|충청남도|충남)/, 'capital'],
  [/^(부산|울산|경상남도|경남)/, 'busan'],
  [/^대구/, 'daegu'],
  [/^대전/, 'daejeon'],
  [/^(광주|전남광주)/, 'gwangju'],
];

/** 병원 주소에서 도시를 판별한다. 노선 칸엔 지역이 없으므로 주소가 유일한 단서다. */
export function metroCityOf(address?: string): MetroCity | undefined {
  const sido = address?.trim().split(/\s+/)[0];
  if (!sido) {
    return undefined;
  }
  return CITY_BY_SIDO.find(([re]) => re.test(sido))?.[1];
}

/**
 * 도시를 이미 아는 상태에서 떼도 되는 접두사.
 *
 * "부산1호선" 의 "부산" 은 주소로 이미 안다. 단 **정확히 일치하는 키를 먼저 본 뒤에** 뗀다 —
 * 안 그러면 "부산김해선" 이 "김해선" 이 되어 버린다.
 */
const PREFIXES = /^(부산지하철|인천지하철|대구지하철|도시철도|지하철|국철|서울|부산|대구|대전|광주)/;

/** 정규화로 안 잡히는 개별 표기. 실제 DB 값에서 나온 것만 둔다. */
const ALIASES: Record<string, string> = {
  // 수도권
  인천선: '인천1호선',
  경의선: '경의중앙선',
  중앙선: '경의중앙선',
  수인분당: '수인분당선',
  분당선: '수인분당선',
  수인선: '수인분당선',
  우이신설: '우이신설선',
  우이신설역: '우이신설선',
  공항철도선: '공항철도',
  '2호전': '2호선', // 오타. 2건.
  // 부산
  동해남부선: '동해선',
  부산김해경전철: '부산김해선',
  김해경전철: '부산김해선',
  김해선: '부산김해선',
};

/**
 * 자유 입력 노선명을 팔레트 키로 맞춘다. 못 맞추면 undefined.
 *
 * "인천지하철", "경전철" 처럼 **어느 노선인지 정할 수 없는 값은 일부러 포기한다.**
 * 찍어서 맞히느니 회색이 낫다.
 */
function normalize(raw: string, city: MetroCity): string | undefined {
  const palette = PALETTES[city];
  const compact = raw.replace(/\s+/g, '');

  const lookup = (key: string): string | undefined => {
    if (palette[key]) {
      return key;
    }
    const alias = ALIASES[key];
    return alias && palette[alias] ? alias : undefined;
  };

  // 1. 있는 그대로. "부산김해선" 이 접두사에 잘리기 전에 잡힌다.
  const direct = lookup(compact);
  if (direct) {
    return direct;
  }

  // 2. 지역·수단 접두사를 떼고. "인천지하철1호선" → "인천1호선" 이 아니라 "1호선" 이 되므로
  //    수도권에선 인천 노선이 서울 노선으로 둔갑한다 → 인천은 접두사를 인천N호선으로 되살린다.
  const stripped = compact.replace(PREFIXES, '');
  if (stripped !== compact && stripped) {
    const isIncheon = /^인천지하철/.test(compact);
    const key = isIncheon ? `인천${stripped}` : stripped;
    const viaPrefix = lookup(key) ?? lookup(numbered(key) ?? '');
    if (viaPrefix) {
      return viaPrefix;
    }
  }

  // 3. 맨숫자. "3,7,9" 가 splitLines 로 쪼개져 "9" 로 온다.
  const asNumber = numbered(compact);
  return asNumber ? lookup(asNumber) : undefined;
}

/** "4" → "4호선". 숫자 하나일 때만. "21A" 같은 건 건드리지 않는다. */
function numbered(value: string): string | undefined {
  return /^\d$/.test(value) ? `${value}호선` : undefined;
}

/**
 * 배지에 넣을 글자. **공식 노선도 약칭이다** — 숫자 노선은 "4호선" 이 아니라 "4" 이고
 * ("호선" 은 모든 노선에 붙어 아무것도 구별하지 않는다), 이름 있는 노선은 "선" 만 뗀다.
 *
 * 첫 글자로 줄이지 않는 이유가 있다. 그러면 경의중앙·경춘·경강이 다 "경" 이 되고
 * 신분당·신림이 다 "신" 이 된다 — 색이 달라도 글자가 같으면 같은 노선으로 읽힌다.
 * 약칭을 그대로 쓰면 겹치는 게 없다.
 */
const SHORT: Record<string, string> = {
  // 수도권
  공항철도: '공항',
  경의중앙선: '경의중앙',
  경춘선: '경춘',
  수인분당선: '수인분당',
  신분당선: '신분당',
  경강선: '경강',
  서해선: '서해',
  인천1호선: '인천1',
  인천2호선: '인천2',
  에버라인: '에버라인',
  의정부경전철: '의정부',
  우이신설선: '우이신설',
  김포골드라인: '김포골드',
  신림선: '신림',
  'GTX-A': 'GTX-A',
  // 부산
  동해선: '동해',
  부산김해선: '부산김해',
  // 대구
  대경선: '대경',
};

function shortOf(key: string): string {
  const digit = /^(\d)호선$/.exec(key);
  return digit ? digit[1] : (SHORT[key] ?? key.replace(/선$/, ''));
}

/**
 * 노선 문자열을 개별 노선으로 쪼갠다.
 *
 * **원본이 여러 노선을 한 칸에 몰아 넣는다** — "36,39 번", "1, 1-1, 58", "2,3호선".
 * 그대로 배지 하나에 넣으면 뭉쳐 읽힌다. 쉼표·가운뎃점·슬래시로 자르고 뒤에 붙은 "번" 을
 * 떼어 낸다. "21A" "31-1" "용인경전철" 처럼 숫자가 아닌 것도 그대로 살린다.
 *
 * 지하철·버스가 같은 칸을 같은 방식으로 쓰므로 둘 다 이걸 지난다.
 */
export function splitLines(line: string): string[] {
  return line
    .split(/[,·/]+/)
    .map((part) => part.trim().replace(/\s*번$/, '').trim())
    .filter(Boolean);
}

/**
 * 역 하나에 걸린 노선 중 **색을 찾은 것만** 원문 그대로 돌려준다.
 *
 * 헤더·목록 카드처럼 위치를 한 줄로 알리는 자리에서 쓴다. 교통 안내는 원본에 뭐가 적혀
 * 있는지가 정보라 못 찾은 값도 회색으로 보여주지만, 여기선 "1번출구" 가 끼면 방해만 된다.
 */
export function stationLines(
  rawLine: string | undefined,
  city?: MetroCity,
): string[] {
  return splitLines(rawLine ?? '').filter((line) => resolveLine(line, city));
}

export interface ResolvedLine {
  /** 배지에 넣을 짧은 글자. "4호선"→"4", "김포골드라인"→"김포골드". */
  short: string;
  /** 말풍선·스크린리더용 정식 이름. 원문 "인천지하철1호선" 은 "인천1호선" 이 된다. */
  label: string;
  bg: string;
}

/**
 * 노선 표기 하나를 색과 정식 이름으로 푼다.
 *
 * 도시를 모르거나(색표 없는 지역) 노선을 못 맞추면 undefined — 호출부는 그때 원문을
 * 회색 알약에 그대로 담는다. **색을 못 찾은 것과 이름을 못 찾은 것은 같은 사건이다** —
 * 이름을 못 고쳤다는 건 그 값이 무엇인지 모른다는 뜻이라, 이름만 다듬어 내보내면 안 된다.
 */
export function resolveLine(
  raw: string,
  city?: MetroCity,
): ResolvedLine | undefined {
  if (!city) {
    return undefined;
  }
  const key = normalize(raw, city);
  if (!key) {
    return undefined;
  }
  return { short: shortOf(key), label: key, bg: PALETTES[city][key] };
}
