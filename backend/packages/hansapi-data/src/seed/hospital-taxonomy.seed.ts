/**
 * 검색용 분류 (진료 분야 그룹 · 병원 규모).
 *
 * **원본에는 없는 우리 분류다.** 공공데이터가 주는 것은 47개 진료과목과 20개 종별 코드뿐이고,
 * 그건 행정·수가 체계지 환자가 읽는 언어가 아니다. 감기 걸린 사람에게 사상체질과·구강병리과를
 * 같은 목록에 보여주면 아무것도 못 고른다.
 *
 * **DB 에 넣지 않고 여기 둔다.** 코드가 아니라 제품 결정이라 자주 바뀌고, 바뀌면 git 에 남아야 한다.
 * 조회는 메타 API 가 이 파일을 그대로 내려준다.
 */

export interface SubjectGroupSeed {
  code: string;
  name: string;

  /** healthcare_code(tp='subject') 의 cd. 검색은 이 목록을 OR 로 건다. */
  subjects: string[];
}

/**
 * 진료 분야 그룹. 기본 검색의 칩이 된다.
 *
 * [원칙]
 * 1. 환자가 아는 이름을 쓴다. "감각기관계"(X) → "안과", "이비인후과"(O)
 * 2. 의학적으로 가까워도 **환자가 다르면 나눈다.** 정신건강의학과(마음)와 신경과(뇌·신경)는
 *    같은 칩에 넣으면 우울증 환자가 신경과에 간다.
 * 3. 환자가 직접 가지 않는 과는 뺀다. 영상의학·병리·진단검사·핵의학·예방의학·직업환경 —
 *    다른 과를 지원하는 과다. 상세 검색의 개별 과목 목록에는 남는다.
 */
export const SUBJECT_GROUPS: SubjectGroupSeed[] = [
  { code: 'internal', name: '내과', subjects: ['IM'] },

  // 특정 부위가 아니라 환자 전체를 본다 — 감기·만성질환·검진·예방접종.
  // "어디 갈지 모를 때" 가는 과라서 내과와 묶지 않고 따로 둔다.
  { code: 'family', name: '가정의학과', subjects: ['FM'] },

  { code: 'pediatrics', name: '소아청소년과', subjects: ['PED'] },

  // 신경외과가 여기 있는 이유: 신경외과 의원은 실제로 대부분 디스크·목·허리 통증을 본다.
  // 뇌수술을 하는 곳은 종합병원이고, 그 환자는 검색이 아니라 의뢰로 간다.
  {
    code: 'ortho',
    name: '정형·통증',
    subjects: ['OS', 'NS', 'REHAB', 'ANES'],
  },

  { code: 'skin', name: '피부·성형', subjects: ['DERM', 'PS'] },
  { code: 'eye', name: '안과', subjects: ['OPH'] },
  { code: 'ent', name: '이비인후과', subjects: ['ENT'] },
  { code: 'obgy', name: '산부인과', subjects: ['OBGY'] },
  { code: 'uro', name: '비뇨의학과', subjects: ['URO'] },
  { code: 'mental', name: '정신건강의학과', subjects: ['PSY'] },
  { code: 'neuro', name: '신경과', subjects: ['NEURO'] },
  { code: 'surgery', name: '외과', subjects: ['GS', 'CS'] },
  { code: 'emergency', name: '응급의학과', subjects: ['EM'] },

  {
    code: 'dental',
    name: '치과',
    subjects: [
      'DENT',
      'ORTHO',
      'PROS',
      'PERIO',
      'ENDO',
      'PEDO',
      'OMFS',
      'OMED',
      'INTEG_DENT',
    ],
  },

  {
    code: 'oriental',
    name: '한방',
    subjects: [
      'KM_IM',
      'KM_ACU',
      'KM_OBGY',
      'KM_PED',
      'KM_PSY',
      'KM_REHAB',
      'KM_ENT_DERM',
      'KM_SASANG',
    ],
  },
];

export interface HospitalTierSeed {
  code: string;
  name: string;

  /** 설명. 화면에 부제로 쓴다. */
  cmt: string;

  /** healthcare_code(tp='class') 의 cd */
  classes: string[];
}

/**
 * 병원 등급.
 *
 * **병상 수로 따로 분류하지 않는다.** 의료법이 이미 병상 수로 종별을 규정하기 때문이다 —
 * 의원(30병상 미만) · 병원(30 이상) · 종합병원(100 이상) · 상급종합(복지부 지정).
 * 병상은 종별을 정하는 근거일 뿐이고, 종별 안에 이미 들어 있다.
 *
 * 사람들은 "의원이냐 병원이냐" 보다 **"동네 병원이냐 큰 병원이냐"** 로 생각한다.
 *
 * **이름을 종별에서 빌려오지 않는다.** 예전엔 코드가 `1|2|3`, 이름이 `의원`·`종합병원` 이었는데,
 * 그 이름은 종별(class)에도 똑같이 있다 — 같은 단어가 "종별 하나" 와 "종별 묶음" 을 동시에
 * 가리켜 반드시 헷갈린다. 특히 `2` 는 병원+종합병원을 묶는데 이름이 '종합병원' 이라 틀렸다.
 * 코드는 TIER1~3 으로, 이름은 '급' 을 붙여 묶음임을 드러낸다.
 *
 * TIER 는 **우리가 매긴 등급**이다. 1·2·3차 의료전달체계는 법적 정의가 따로 있어 그 이름
 * (PRIMARY/TERTIARY)을 쓰면 "공식 차수와 같다" 는 잘못된 신호를 준다.
 *
 * 요양병원·정신병원은 이 체계 밖이다. 장기 입원 시설이라 외래 진료의 등급과 다른 축이다.
 */
export const HOSPITAL_TIERS: HospitalTierSeed[] = [
  {
    code: 'TIER1',
    name: '의원급',
    cmt: '동네 의원. 외래 중심, 병상 30개 미만',
    classes: [
      'CLINIC',
      'DENTAL_CLINIC',
      'KM_CLINIC',
      'MIDWIFE',
      'HEALTH_CENTER',
      'HEALTH_SUB',
      'HEALTH_POST',
      'HEALTH_MED',
    ],
  },
  {
    code: 'TIER2',
    name: '병원급',
    cmt: '병원·종합병원. 입원 가능, 병상 30개 이상',
    // 정신병원(MENTAL)은 병상 규모로는 2차지만 여기 넣지 않는다.
    // 장기 입원 시설이라 INPATIENT_ONLY_CLASSES 로 따로 뺀다 — 두 곳에 두면 서로 어긋난다.
    classes: [
      'GENERAL',
      'HOSPITAL',
      'SPECIALTY',
      'DENTAL_HOSP',
      'KM_HOSPITAL',
      'KM_GENERAL',
    ],
  },
  {
    code: 'TIER3',
    name: '상급종합',
    // 진료의뢰서 없이 가면 진료비 전액을 본인이 낸다. 화면에서 경고해야 한다.
    cmt: '상급종합병원. 중증질환 중심, 진료의뢰서 필요',
    classes: ['TERTIARY'],
  },
];

/**
 * 기본 검색에서 빼는 종별.
 *
 * **입원 시설이다.** 본인이 검색해서 걸어 들어가는 곳이 아니라 가족이 장기 요양을 위해 고른다.
 * 판단 기준도 다르다 — 진료시간·지하철역이 아니라 병상 수·간호등급이다.
 * "정신건강의학과" 로 검색한 사람에게 239병상짜리 폐쇄병동이 나오면 그건 사고다.
 *
 * 숨기는 게 아니라 **진입점을 나누는 것**이다. 종별로 직접 고르면 나온다.
 */
export const INPATIENT_ONLY_CLASSES = ['NURSING', 'MENTAL'] as const;

/**
 * 병원 등급 코드. healthcare_hospital.tier 에 **빌드 때 확정해 넣는다.**
 *
 * 조회 시점에 종별 8개를 IN 절로 나열하면 인덱스를 못 타고 URL 도 길어진다.
 * 종별에서 유도되는 값이라 원본이 바뀌지 않는 한 안 바뀐다 — 미리 계산해 두는 게 맞다.
 *
 *   TIER1    동네 의원 (의원·치과의원·한의원·보건기관)
 *   TIER2    병원·종합병원
 *   TIER3    상급종합병원
 *   NURSING  요양병원 ┐ **등급이 아니라 성격이 다르다.** 장기 입원 시설이라 기본 검색에서
 *   MENTAL   정신병원 ┘ 빼고 별도 진입점을 준다. 같은 컬럼에 두면 제외가 한 줄로 끝난다.
 *                      TIER 계열과 모양이 다른 것이 "다른 축" 이라는 신호다.
 *   null     약국·기타 등 어디에도 안 맞는 것
 */
export type HospitalTier = 'TIER1' | 'TIER2' | 'TIER3' | 'NURSING' | 'MENTAL';

/**
 * 종별 → 등급. 빌드가 이걸로 tier 컬럼을 채운다.
 *
 * 요양병원과 정신병원을 **따로 둔다.** 둘 다 장기 입원 시설이지만 찾는 사람이 다르다 —
 * 요양은 어르신을 모실 곳, 정신은 정신질환 입원 치료다. 한 덩어리로 묶으면 검색이 섞인다.
 */
export function hospitalTier(classCd: string | null): HospitalTier | null {
  if (!classCd) {
    return null;
  }
  if (classCd === 'NURSING') {
    return 'NURSING';
  }
  if (classCd === 'MENTAL') {
    return 'MENTAL';
  }
  const tier = HOSPITAL_TIERS.find((t) => t.classes.includes(classCd));
  return (tier?.code as HospitalTier) ?? null;
}

/** 기본 검색에서 빼는 등급. 장기 입원 시설이라 외래 검색에 섞이면 방해다. */
export const INPATIENT_TIERS = ['NURSING', 'MENTAL'] as const;

// ── 계열 정합성 ─────────────────────────────────────────────

/**
 * 면허 계열. 의과 · 치과 · 한의과는 **면허가 다르다.**
 * 한의사는 치과 진료를 할 수 없고, 치과의사는 한방 진료를 할 수 없다.
 */
export type MedicalField = 'med' | 'dent' | 'km';

/** 치과 과목 (지원과 포함). 나머지 비-KM 과목은 전부 의과다. */
const DENTAL_SUBJECTS = [
  'DENT',
  'PROS',
  'ORTHO',
  'PEDO',
  'PERIO',
  'ENDO',
  'OMED',
  'OMFS',
  'ORAD',
  'OPATH',
  'PREV_DENT',
  'INTEG_DENT',
] as const;

/** 과목의 계열. KM_ 접두는 한방이다. */
export function subjectField(subjectCd: string): MedicalField {
  if (subjectCd.startsWith('KM_')) {
    return 'km';
  }
  return (DENTAL_SUBJECTS as readonly string[]).includes(subjectCd)
    ? 'dent'
    : 'med';
}

/**
 * 계열이 하나로 고정되는 기관. **의원급뿐이다.**
 *
 * 한의원·치과의원은 한의사·치과의사가 개설하고 본인만 진료한다. 다른 계열 과목이 있을 수 없다.
 *
 * **병원급은 넣으면 안 된다.** 한방병원은 의사를 고용해 의과 진료과를 둘 수 있고, 실제로 둔다 —
 * 실측 결과 한방병원의 의과 과목이 1,557건이고 그중 가정의학과 372건에는 전문의가 71명 있다.
 * 이걸 오류로 지우면 멀쩡한 데이터를 날린다. 종합병원의 치과·한방과도 마찬가지로 정상이다.
 */
const SINGLE_FIELD_CLASSES: Record<string, MedicalField> = {
  KM_CLINIC: 'km',
  DENTAL_CLINIC: 'dent',
};

/**
 * 이 기관이 이 과목을 진료할 수 있나.
 *
 * **종별만 보고 판단하면 틀린다.** 복수면허(의사+한의사)가 실재하기 때문이다 —
 * 성모힐링척의원·한의원은 종별이 한의원인데 정형외과·신경외과·마취통증의학과를 진료하고,
 * **HIRA 와 NMC 가 둘 다 그렇게 말한다.** 진짜다. 이름에 "의원"과 "한의원"이 함께 들어간다.
 *
 * 반면 진짜 오류는 **한쪽 원본만 주장한다.**
 *   갑산한의원   HIRA 한방만 · NMC 한방 + 내과        → NMC 오류
 *   구리튼튼치과의원 HIRA 예방치과 · NMC 예방치과 + 예방의학과 → NMC 오류
 *
 * 그래서 기준은 종별이 아니라 **두 원본의 일치 여부**다. HIRA(요양급여 청구 기반)가
 * 뒷받침하면 계열이 안 맞아도 믿는다. HIRA 가 있는데도 그 과목이 없다면 NMC 가 틀린 것이다.
 *
 * @param hiraDeclared HIRA 도 이 과목을 신고했나. HIRA 자체가 없는 병원(NMC 전용)이면 undefined.
 */
export function isSubjectAllowed(
  classCd: string | null,
  subjectCd: string,
  hiraDeclared?: boolean,
): boolean {
  if (!classCd) {
    return true;
  }

  const field = SINGLE_FIELD_CLASSES[classCd];
  if (field === undefined || field === subjectField(subjectCd)) {
    return true;
  }

  // 계열이 안 맞는다. HIRA 가 뒷받침하면 복수면허로 본다.
  // HIRA 가 아예 없는 병원(NMC 전용)은 대조할 방법이 없다 — 그때는 NMC 를 믿는다.
  return hiraDeclared !== false;
}
