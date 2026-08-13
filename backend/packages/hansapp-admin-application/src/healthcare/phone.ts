/**
 * 전화번호 정규화.
 *
 * HIRA(telno)·NMC(dutyTel1)는 표기가 제각각이다 — `051)240-7000`, `(02)2072-2114`,
 * `031-123-4567, 4568`, `1588-1234`, `990-6114`(지역번호 누락), 전각 `）－`, `(대표)`,
 * `내선` 주석까지 섞여 온다. **구분자를 하나씩 상대하지 않고 숫자만 남긴 뒤 규칙대로 다시
 * 포맷팅한다** — 그러면 `)`·공백·점·전각이 한 번에 사라진다.
 *
 * 적재(빌드) 시점에 이걸 태워 DB에는 항상 "지역번호까지 완비된 한국식 번호"만 넣는다.
 * 그래야 다음 동기화의 새 후보도 같은 정규화를 거쳐 저장값과 apples-to-apples 로 비교된다.
 * 국제(+82) 표기는 출력 단의 별개 관심사다 — 여기서는 국내 표기만 만든다.
 */

/**
 * HIRA sggu_cd(심평원 지역코드) 앞 2자리 → 지역번호.
 *
 * 우리 통합 지역코드(46=전남광주)로는 전남(061)·광주(062)를 못 가른다. 원본 HIRA 코드는
 * 실제 행정코드라 서로 다른 값(24=광주, 36=전남)이라 모호함이 없다.
 */
const HIRA_AREA: Record<string, string> = {
  '11': '02', // 서울
  '21': '051', // 부산
  '22': '032', // 인천
  '23': '053', // 대구
  '24': '062', // 광주
  '25': '042', // 대전
  '26': '052', // 울산
  '31': '031', // 경기
  '32': '033', // 강원
  '33': '043', // 충북
  '34': '041', // 충남
  '35': '063', // 전북
  '36': '061', // 전남
  '37': '054', // 경북
  '38': '055', // 경남
  '39': '064', // 제주
  '41': '044', // 세종
};

/** NMC 시도명(원본 문자열) → 지역번호. 특별자치도 개편 전후 명칭을 모두 받는다. */
const NMC_AREA: Record<string, string> = {
  서울특별시: '02',
  부산광역시: '051',
  인천광역시: '032',
  대구광역시: '053',
  광주광역시: '062',
  대전광역시: '042',
  울산광역시: '052',
  경기도: '031',
  강원도: '033',
  강원특별자치도: '033',
  충청북도: '043',
  충청남도: '041',
  전라북도: '063',
  전북특별자치도: '063',
  전라남도: '061',
  경상북도: '054',
  경상남도: '055',
  제주도: '064',
  제주특별자치도: '064',
  세종특별자치시: '044',
};

/** HIRA sggu_cd 로 지역번호를 찾는다. 못 찾으면 undefined(=지역번호를 못 채움). */
export function hiraAreaCode(sgguCd: string | null | undefined): string | undefined {
  if (!sgguCd) return undefined;
  return HIRA_AREA[sgguCd.slice(0, 2)];
}

/**
 * NMC 시도명으로 지역번호를 찾는다.
 * 통합 지역명('전남광주통합특별시')은 전남·광주가 섞여 있어 지역번호를 특정할 수 없다 →
 * undefined 를 돌려 지역번호를 함부로 채우지 않는다(틀린 번호를 만드느니 로컬 그대로 둔다).
 */
export function nmcAreaCode(sidoNm: string | null | undefined): string | undefined {
  if (!sidoNm) return undefined;
  return NMC_AREA[sidoNm.trim()];
}

/**
 * 완전한 0-접두 국내번호(숫자만)를 하이픈으로 나눈다.
 *
 * 접두 길이(02=2, 그 외 지역·휴대폰·070=3, 0507류=4)를 정하고, 남은 가입자번호를
 * 8자리면 4-4, 7자리면 3-4 로 가른다. 서울 옛 7자리(02-XXX-XXXX)도 이 규칙에 들어온다.
 */
function formatKR(d: string): string {
  const prefixLen = d.startsWith('02')
    ? 2
    : /^050\d/.test(d) // 0503·0505·0507 등 안심·평생번호
      ? 4
      : 3; // 010·011·070·031~064

  const prefix = d.slice(0, prefixLen);
  const rest = d.slice(prefixLen);
  if (rest.length <= 4) return `${prefix}-${rest}`;

  const mid = rest.length >= 8 ? 4 : rest.length - 4; // 8자리→4-4, 7자리→3-4
  return `${prefix}-${rest.slice(0, mid)}-${rest.slice(mid)}`;
}

/** 지역번호를 못 채운 로컬 번호(7~8자리)라도 하이픈은 넣어 준다. */
function formatLocal(d: string): string {
  if (d.length <= 4) return d;
  const mid = d.length >= 8 ? 4 : d.length - 4;
  return `${d.slice(0, mid)}-${d.slice(mid)}`;
}

/**
 * 전화번호 하나를 한국식 표기로 정규화한다.
 *
 * @param raw      원본 문자열(HIRA telno / NMC dutyTel1)
 * @param areaCode 이 병원의 지역번호("02"·"051"…). 지역번호 없는 로컬 번호를 채울 때 쓴다.
 * @returns        정규화된 국내 표기, 또는 판단 불가·빈값이면 null
 */
export function normalizeTel(
  raw: string | null | undefined,
  areaCode?: string | null,
): string | null {
  if (!raw) return null;

  // 0) 전각→반각 정규화. 전각 숫자(８)·괄호(）)·대시(－)를 ASCII 로 바꿔
  //    아래 숫자 추출·토큰 분리가 전각에도 통하게 한다.
  const s = String(raw).normalize('NFKC');

  // 1) 복수번호·내선·주석을 첫 번째 유효 토큰만 남기고 자른다.
  //    쉼표·슬래시·물결(범위)·"외"·"내선"·"ext" 에서 끊는다.
  const head = s.split(/[,/]|~|외|\(?\s*내선|\bext\b/i)[0] ?? '';

  // 2) 숫자만 남긴다 — )·(·공백·점·전각기호·"(대표)" 같은 무숫자 주석이 여기서 전부 소멸.
  const d = head.replace(/\D/g, '');
  if (d.length < 7) return null; // "없음"·"-"·짧은 쓰레기값

  // 3) 대표번호(15xx·16xx·18xx). 지역번호도 +82도 없이 그대로 쓴다(8자리 4-4).
  if (/^1[568]\d{2}/.test(d)) {
    return d.length >= 8 ? `${d.slice(0, 4)}-${d.slice(4, 8)}` : null;
  }

  // 4) 이미 0 으로 시작(지역·휴대폰·070·0507) → 그대로 포맷.
  if (d.startsWith('0')) return formatKR(d);

  // 5) 지역번호 없는 로컬 번호(2~9 로 시작, 7~8자리) → 지역번호를 채운다.
  //    못 채우면(광주/전남 통합 등) 로컬 그대로 하이픈만.
  if (/^[2-9]\d{6,7}$/.test(d)) {
    return areaCode ? formatKR(areaCode + d) : formatLocal(d);
  }

  // 6) 그 외(판단 불가) → 버린다.
  return null;
}
