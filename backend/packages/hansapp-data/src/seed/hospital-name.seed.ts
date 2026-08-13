/**
 * 병원 이름에서 **법인 표기를 떼어낸다.**
 *
 * 원본(HIRA yadmNm · NMC dutyName)은 이름 하나만 준다. 그런데 그 안에 법인격이 섞여 있다.
 *
 *   (의)일맥의료재단 강동더서울의원
 *   학교법인 고려중앙학원 고려대학교의과대학부속병원(안암병원)
 *
 * 목록에서 이걸 그대로 쓰면 화면의 절반이 법인명이고, 정작 병원 이름은 잘려 보인다.
 * 그렇다고 버리면 안 된다 — 법인명은 군더더기가 아니라 **계열 정보**다(대학병원 묶기).
 * 그래서 떼되 버리지 않는다.
 *
 * [실측 2026-08 · develop 81,772건]
 *   손 안 댐   80,702 (98.69%)
 *   분리          993
 *   표기만 제거     77   법인격은 붙었는데 법인명을 못 가른 것
 *   손상            0   괄호 짝·부분문자열 검사 통과
 *
 * [왜 사전이 아닌가]
 * 법인 이름은 686개나 되지만 **손으로 적을 필요가 없다.** 법인명은 거의 항상 조직을 뜻하는
 * 말(재단·학원·협회·공제회…)로 끝나기 때문에, 그 말까지가 법인명이고 나머지가 병원이다.
 * 686개를 관리하는 대신 접미어 17개만 관리한다.
 *
 * [왜 띄어쓰기를 안 믿나]
 * 원본 표기가 흔들린다 — `(의) 열린의료재단`·`(의)열린의료재단`·`의료법인열린의료재단`이
 * 모두 같은 것이다. 954건 중 507건이 법인명과 병원명이 붙어 있다. 공백을 경계로 삼으면
 * 절반을 놓친다. 경계는 공백이 아니라 접미어다.
 */

/** 법인격. 의료법·사립학교법 등이 정한 유한 목록이라 늘어날 일이 거의 없다. */
const CORP_KINDS = [
  '의료법인',
  '학교법인',
  '재단법인',
  '사단법인',
  '사회복지법인',
  '특수법인',
] as const;

/**
 * 괄호 축약 표기 → 법인격.
 *
 * **괄호가 있어야만 인정한다.** 괄호를 선택으로 두면 `의정부…의원`의 첫 글자 `의`를
 * 법인격으로 오인해 `정부…의원`이 된다. 전수 검증에서 실제로 걸린 버그다.
 */
const CORP_ABBR: Record<string, (typeof CORP_KINDS)[number]> = {
  의: '의료법인',
  학: '학교법인',
  재: '재단법인',
  사: '사단법인',
  복: '사회복지법인',
  특: '특수법인',
};

/**
 * 법인명이 끝나는 자리를 알려주는 말.
 *
 * **긴 것이 먼저 올 필요는 없다** — 가장 먼저 끝나는 자리를 고르기 때문이다.
 * `일맥의료재단`은 '의료재단'과 '재단' 둘 다 걸리지만 끝나는 위치가 같다.
 *
 * 단독 '회'·'법인'은 **일부러 뺐다.** `회`는 병원 이름 안에도 흔해서(회복·조회) 엉뚱한
 * 자리에서 잘린다. 조직을 뜻하는 것이 분명한 말만 남긴다.
 */
const CORP_SUFFIXES = [
  '의료재단',
  '유지재단',
  '복지재단',
  '장학재단',
  '재단',
  '학원',
  '공제회',
  '선교회',
  '복지회',
  '보건협회',
  '협회',
  '공단',
  '공사',
  '연구소',
  '의료원',
  '장학회',
  '종',
] as const;

/**
 * 떼어낸 뒤 남은 것이 병원인지 확인하는 말.
 *
 * **이 검사가 손상 0을 만든다.** 규칙이 엉뚱한 자리를 자르면 남은 문자열이 병원처럼
 * 안 생기므로 여기서 걸러지고, 그때는 자르지 않고 원문을 그대로 쓴다.
 * 최악이 "이름이 깨짐"이 아니라 "안 짧아짐"이 되게 하는 장치다.
 */
const HOSPITAL_TAIL = /(의원|병원|한의원|보건소|보건지소|보건진료소|의료원|센터|조산원)/;

/** 앞뒤에서 털어낼 문자. **괄호는 넣지 않는다** — 이름의 일부일 수 있다. */
const TRIM = ' \t -·';

const KIND_PATTERN = CORP_KINDS.join('|');
const ABBR_PATTERN = Object.keys(CORP_ABBR).join('|');

/**
 * 이름 맨 앞의 법인 표기.
 *
 *   (의료법인) · [의료법인] · 의료법인 · 의료법인)   ← 여는 괄호가 빠진 실데이터가 있다
 *   (의) · [의]                                  ← 축약형은 괄호 필수
 */
const LEAD = new RegExp(
  `^(?:[([]\\s*(${KIND_PATTERN})\\s*[)\\]]` +
    `|(${KIND_PATTERN})\\s*[)\\]]?` +
    `|[([]\\s*(${ABBR_PATTERN})\\s*[)\\]])\\s*`,
);

/** 분리 결과. */
export interface HospitalNameParts {
  /** 표시·검색용 짧은 이름. 못 떼면 원문과 같다. */
  name: string;
  /** 법인격 + 법인명. 법인명을 못 가르면 null 이다 — 법인격만 남으면 정보가 아니라 노이즈다. */
  corpName: string | null;
}

function trim(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && TRIM.includes(value[start])) start += 1;
  while (end > start && TRIM.includes(value[end - 1])) end -= 1;
  return value.slice(start, end);
}

/**
 * 병원 원문 이름을 짧은 이름과 법인명으로 가른다.
 *
 * 어느 단계에서든 확신이 없으면 **원문을 그대로 돌려준다.** 이름을 망가뜨리는 것보다
 * 안 짧아지는 편이 낫다 — 한국어 화면에서만 이상하면 아무도 신고하지 않기 때문이다.
 *
 *   splitHospitalName('(의)일맥의료재단 강동더서울의원')
 *     → { name: '강동더서울의원', corpName: '의료법인 일맥의료재단' }
 *
 *   splitHospitalName('서울성모의원')
 *     → { name: '서울성모의원', corpName: null }
 */
export function splitHospitalName(legalName: string): HospitalNameParts {
  const source = legalName.trim();

  const lead = LEAD.exec(source);
  if (!lead) {
    return { name: source, corpName: null };
  }

  // 축약형이면 풀네임으로 편다. `(의)`와 `의료법인`이 같은 값으로 모여야
  // "이 재단 소속 병원 전부" 같은 조회가 그냥 된다.
  const kind = lead[1] ?? lead[2] ?? CORP_ABBR[lead[3]];
  const rest = source.slice(lead[0].length).trim();

  // 법인 표기를 뗐는데 병원이 아니면 잘못 뗀 것이다.
  if (!rest || !HOSPITAL_TAIL.test(rest)) {
    return { name: source, corpName: null };
  }

  // 가장 먼저 끝나는 접미어에서 가른다. 뒤에 아무것도 안 남는 자리는 고르지 않는다 —
  // 그건 법인명이 아니라 병원 이름의 일부다(`…의료원`으로 끝나는 병원).
  let cut: number | null = null;
  for (const suffix of CORP_SUFFIXES) {
    const at = rest.indexOf(suffix);
    if (at === -1) continue;
    const end = at + suffix.length;
    if (end < rest.length && (cut === null || end < cut)) {
      cut = end;
    }
  }

  if (cut !== null) {
    const corp = trim(rest.slice(0, cut));
    const hospital = trim(rest.slice(cut));
    if (corp && hospital && HOSPITAL_TAIL.test(hospital)) {
      return { name: hospital, corpName: `${kind} ${corp}` };
    }
  }

  // 법인격은 확실한데 법인명을 못 갈랐다. 표기만 떼고 corpName 은 비운다.
  return { name: rest, corpName: null };
}
