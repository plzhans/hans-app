/**
 * HIRA 코드 시드 (hira_code 중 API 가 코드표를 안 주는 것).
 *
 * **심평원 코드인데 API 가 코드표를 안 주는 것**만 여기 있다. codeInfoService 가 주는 6종
 * (addr·class·subject·equipment·specialty·special)은 sync 가 채우므로 여기 없다.
 *
 * [왜 healthcare_code 가 아닌가]
 * healthcare_code 는 HIRA·NMC 두 원본의 체계가 달라 우리 코드로 통합하는 곳이다.
 * 병원평가는 심평원이 직접 수행하고 등급을 부여하는 **심평원 전용 개념**이라 통합할 상대가 없다.
 * 통합 레이어를 통과시켜도 추상화되는 게 없어서(우리 코드가 결국 원본 번호 그대로가 된다)
 * 원본 코드 테이블인 여기 담는다.
 *
 * [왜 hira_code 가 맞는가]
 * hira_code 는 순수 미러가 아니다. tp 는 이미 "API 가 주는 값이 아니라 우리가 붙이는 구분자" 고,
 * 원본 필드명(addrCd·clCd·srchCd)을 cd/cd_nm 으로 통일해 담는 정규화 계층이다.
 * 코드표가 없는 심평원 코드를 여기 얹는 것은 그 성격과 맞다.
 *
 * [sync 와 겹치지 않는다]
 * **소유가 tp 로 갈린다.** sync 는 HIRA_CODE_TYPES(6종)를 소유하고, 시드는 그 6종이 아닌
 * 나머지 전부를 소유한다. asm* 은 6종에 없어 sync 가 구조적으로 안 건드리고,
 * 시드는 6종을 건드리지 않는다.
 */

export interface HiraCodeSeed {
  /** 코드 종류 = 상위 계층. 병원평가는 그룹이 여기 온다(asm01~asm09). */
  tp: string;

  /** 코드 종류명 = 상위 계층의 이름. 병원평가는 그룹명이다. */
  tpNm: string;

  /** 코드 종류명 번역. 화면에 그대로 나가는 값이라 필요하다. */
  tpNmEn: string;
  tpNmJa: string;
  tpNmZh: string;

  /** 코드값. 병원평가는 원본 asmGrd 번호. */
  cd: string;

  /** 코드명. */
  cdNm: string;

  /**
   * 코드명 번역.
   *
   * **심평원 공식 명칭의 번역이 아니라 우리가 붙인 표시용 이름이다** — 심평원은 한국어만 준다.
   * 화면(병원상세 평가 탭)에 그대로 나가므로 영어로 보는 사용자에게 "급성기뇌졸중" 이 뜨지 않게
   * 하려는 것이다. 잠정값이니 어색한 게 보이면 개별로 고쳐라.
   */
  cdNmEn: string;
  cdNmJa: string;
  cdNmZh: string;

  /** 설명. 원본에 없어서 우리가 남기는 메모다. */
  cmt?: string;
}

/** 적정성평가 항목이 뜨는 검색 맥락. */
export type AsmScope = 'general' | 'nursing';

/**
 * 항목별로 어느 맥락에 노출할지. 상세 검색 "우수 병원" 필터가 **탭에 맞는 항목만** 보이게 쓴다.
 *
 * (2026-07 dev 실측) 요양병원은 요양병원 평가(10) 말고도 혈액투석(03)·약품목수(09)·
 * 만성폐쇄성폐질환(17)을 받는다. 반대로 요양병원(10)은 **요양 전용**이라 일반 검색엔 안 뜬다.
 * 나머지 18개는 전부 일반(병원급) 항목이다 — 일반·응급·달빛·정신 탭은 같은 세트를 쓴다.
 *
 *   general  일반·응급·달빛·정신 (요양병원 항목 10 만 뺀 전부)
 *   nursing  요양 (요양병원이 실제로 받는 4개)
 *
 * **목록에 없는 코드는 general 만.** 임상적으로 안정적이라(요양병원이 암수술을 시작할 일은 없다)
 * 손댈 일이 거의 없지만, 원본이 새 항목을 주기 시작하면 여기 한 줄로 조정한다.
 */
export const ASM_ITEM_SCOPE: Record<string, readonly AsmScope[]> = {
  '10': ['nursing'], // 요양병원 — 요양 전용
  '03': ['general', 'nursing'], // 혈액투석
  '09': ['general', 'nursing'], // 약품목수
  '17': ['general', 'nursing'], // 만성폐쇄성폐질환
};

/**
 * 병원평가 항목. 출처: hospAsmInfoService1 의 asmGrd01~24 필드.
 *
 * [계층]
 * hira_code 는 tp/tp_nm(상위) → cd/cd_nm(하위) 2단이다(nmc_code 의 cm_mid → cm_sid 와 같은 모양).
 * 병원평가의 실제 계층도 **"그룹 > 항목" 2단**이라 그대로 들어간다.
 *   tp='asm01'(급성질환) → cd='01'(급성기뇌졸중) · '06'(관상동맥우회술) · '18'(폐렴)
 *
 * "병원평가항목" 이라는 레벨은 만들지 않는다 — 모든 행에 똑같이 붙는 **상수라 계층이 아니다.**
 * 그 자리를 그룹이 차지한다. 평가항목 전체는 tp LIKE 'asm%' 로 뽑는다.
 * 그룹 번호(01~09)는 심평원 홈페이지 노출 순서를 우리가 옮긴 것이다(원본에 그룹 코드가 없다).
 *
 * [cd 가 원본 번호인 이유]
 * API 가 asmGrd01 같은 필드명으로만 주고 그게 무엇인지는 메뉴얼에만 있다. 이름을 지어봐야
 * 표준 약어가 없어 임의 명명이 되고, cd 는 검색 API 의 필터 값으로 URL 에 그대로 나가 짧아야 한다.
 * 그래서 원본 번호를 쓴다. 뜻은 cd_nm 이 갖는다. hira_hospital_asm 의 컬럼명(asm_01…)과 1:1 이다.
 *
 * [02 와 11 은 없다]
 * 메뉴얼에도 원본 swagger 에도 없다. 22개다. 빠진 번호를 채우려 하지 마라.
 *
 * [웹에 있는데 API 에 없는 항목이 있다]
 * 심평원 홈페이지는 9개 그룹 30개 항목을 보여주는데 이 API 는 22개만 준다. 없는 8개:
 *   급성질환   급성심근경색증
 *   정신건강   우울증 외래 · 치매
 *   기타      수혈 · 결핵 · 영상검사
 *   난임시술   인공수정 평가지표 · 체외수정 평가지표  ← 그룹 통째로 없다(그래서 asm09 가 없다)
 * 그 8개는 asmGrd 필드 자체가 없어 값을 받을 수단이 없다. **추측해서 코드를 만들지 마라.**
 * 나중에 API 가 주기 시작하면 그때 실응답으로 확인하고 추가하라.
 */
const ASSESSMENTS: HiraCodeSeed[] = [
  // ── asm01 급성질환 (웹 4개 중 3개. 급성심근경색증은 API 에 없다) ──
  {
    tp: 'asm01',
    tpNm: '급성질환',
    tpNmEn: 'Acute Conditions',
    tpNmJa: '急性疾患',
    tpNmZh: '急性疾病',
    cd: '01',
    cdNm: '급성기뇌졸중',
    cdNmEn: 'Acute Stroke',
    cdNmJa: '急性期脳卒中',
    cdNmZh: '急性期脑卒中',
  },
  {
    tp: 'asm01',
    tpNm: '급성질환',
    tpNmEn: 'Acute Conditions',
    tpNmJa: '急性疾患',
    tpNmZh: '急性疾病',
    cd: '06',
    cdNm: '관상동맥우회술',
    cdNmEn: 'Coronary Artery Bypass Graft',
    cdNmJa: '冠動脈バイパス術',
    cdNmZh: '冠状动脉搭桥术',
  },
  {
    tp: 'asm01',
    tpNm: '급성질환',
    tpNmEn: 'Acute Conditions',
    tpNmJa: '急性疾患',
    tpNmZh: '急性疾病',
    cd: '18',
    cdNm: '폐렴',
    cdNmEn: 'Pneumonia',
    cdNmJa: '肺炎',
    cdNmZh: '肺炎',
  },

  // ── asm02 만성질환 ──
  {
    tp: 'asm02',
    tpNm: '만성질환',
    tpNmEn: 'Chronic Conditions',
    tpNmJa: '慢性疾患',
    tpNmZh: '慢性疾病',
    cd: '03',
    cdNm: '혈액투석',
    cdNmEn: 'Hemodialysis',
    cdNmJa: '血液透析',
    cdNmZh: '血液透析',
  },
  {
    tp: 'asm02',
    tpNm: '만성질환',
    tpNmEn: 'Chronic Conditions',
    tpNmJa: '慢性疾患',
    tpNmZh: '慢性疾病',
    cd: '16',
    cdNm: '천식',
    cdNmEn: 'Asthma',
    cdNmJa: '喘息',
    cdNmZh: '哮喘',
    // 인코딩이 이 항목만 다르다. 등급 체계는 같다. (2026-07 심평원 홈페이지 대조)
    //   일반 21개 :  1        2 3 4 5   '등급제외'
    //   천식      : '양호'     2 3 4 5    0
    cmt: "인코딩이 다르다: 1등급을 '양호' 로, 등급제외를 0 으로 준다. 등급 체계는 나머지와 동일. 0 은 최하 등급이 아니다.",
  },
  {
    tp: 'asm02',
    tpNm: '만성질환',
    tpNmEn: 'Chronic Conditions',
    tpNmJa: '慢性疾患',
    tpNmZh: '慢性疾病',
    cd: '17',
    cdNm: '만성폐쇄성폐질환',
    cdNmEn: 'COPD',
    cdNmJa: '慢性閉塞性肺疾患',
    cdNmZh: '慢性阻塞性肺疾病',
  },
  {
    tp: 'asm02',
    tpNm: '만성질환',
    tpNmEn: 'Chronic Conditions',
    tpNmJa: '慢性疾患',
    tpNmZh: '慢性疾病',
    cd: '24',
    cdNm: '고혈압·당뇨병',
    cdNmEn: 'Hypertension & Diabetes',
    cdNmJa: '高血圧・糖尿病',
    cdNmZh: '高血压·糖尿病',
  },

  // ── asm03 암질환 ──
  {
    tp: 'asm03',
    tpNm: '암질환',
    tpNmEn: 'Cancer',
    tpNmJa: 'がん',
    tpNmZh: '癌症',
    cd: '12',
    cdNm: '대장암',
    cdNmEn: 'Colorectal Cancer',
    cdNmJa: '大腸がん',
    cdNmZh: '结直肠癌',
  },
  {
    tp: 'asm03',
    tpNm: '암질환',
    tpNmEn: 'Cancer',
    tpNmJa: 'がん',
    tpNmZh: '癌症',
    cd: '13',
    cdNm: '위암',
    cdNmEn: 'Gastric Cancer',
    cdNmJa: '胃がん',
    cdNmZh: '胃癌',
  },
  {
    tp: 'asm03',
    tpNm: '암질환',
    tpNmEn: 'Cancer',
    tpNmJa: 'がん',
    tpNmZh: '癌症',
    cd: '14',
    cdNm: '유방암',
    cdNmEn: 'Breast Cancer',
    cdNmJa: '乳がん',
    cdNmZh: '乳腺癌',
  },
  {
    tp: 'asm03',
    tpNm: '암질환',
    tpNmEn: 'Cancer',
    tpNmJa: 'がん',
    tpNmZh: '癌症',
    cd: '15',
    cdNm: '폐암',
    cdNmEn: 'Lung Cancer',
    cdNmJa: '肺がん',
    cdNmZh: '肺癌',
  },

  // ── asm04 약제 ──
  {
    tp: 'asm04',
    tpNm: '약제',
    tpNmEn: 'Medication',
    tpNmJa: '薬剤',
    tpNmZh: '药物',
    cd: '05',
    cdNm: '수술적 예방적 항생제',
    cdNmEn: 'Surgical Antibiotic Prophylaxis',
    cdNmJa: '術前予防抗菌薬',
    cdNmZh: '手术预防性抗生素',
    cmt: '메뉴얼 표기는 "수술부위 감염예방 항생제". 홈페이지 표기를 따랐다.',
  },
  {
    tp: 'asm04',
    tpNm: '약제',
    tpNmEn: 'Medication',
    tpNmJa: '薬剤',
    tpNmZh: '药物',
    cd: '07',
    cdNm: '급성상기도 감염 항생제 처방률',
    cdNmEn: 'Antibiotics for Upper Respiratory Infection',
    cdNmJa: '急性上気道感染症の抗菌薬処方率',
    cdNmZh: '急性上呼吸道感染抗生素处方率',
  },
  {
    tp: 'asm04',
    tpNm: '약제',
    tpNmEn: 'Medication',
    tpNmJa: '薬剤',
    tpNmZh: '药物',
    cd: '08',
    cdNm: '주사제 처방률',
    cdNmEn: 'Injection Prescription Rate',
    cdNmJa: '注射剤処方率',
    cdNmZh: '注射剂处方率',
  },
  {
    tp: 'asm04',
    tpNm: '약제',
    tpNmEn: 'Medication',
    tpNmJa: '薬剤',
    tpNmZh: '药物',
    cd: '09',
    cdNm: '약품목수',
    cdNmEn: 'Number of Prescribed Drugs',
    cdNmJa: '処方薬剤品目数',
    cdNmZh: '处方药品数',
  },
  {
    tp: 'asm04',
    tpNm: '약제',
    tpNmEn: 'Medication',
    tpNmJa: '薬剤',
    tpNmZh: '药物',
    cd: '23',
    cdNm: '급성하기도 감염 항생제 처방률',
    cdNmEn: 'Antibiotics for Lower Respiratory Infection',
    cdNmJa: '急性下気道感染症の抗菌薬処方率',
    cdNmZh: '急性下呼吸道感染抗生素处方率',
  },

  // ── asm05 요양병원 ──
  {
    tp: 'asm05',
    tpNm: '요양병원',
    tpNmEn: 'Long-term Care Hospital',
    tpNmJa: '療養病院',
    tpNmZh: '疗养医院',
    cd: '10',
    cdNm: '요양병원',
    cdNmEn: 'Long-term Care Hospital',
    cdNmJa: '療養病院',
    cdNmZh: '疗养医院',
  },

  // ── asm06 중환자실 ──
  {
    tp: 'asm06',
    tpNm: '중환자실',
    tpNmEn: 'Intensive Care',
    tpNmJa: '集中治療室',
    tpNmZh: '重症监护',
    cd: '19',
    cdNm: '성인 중환자실',
    cdNmEn: 'Adult Intensive Care Unit',
    cdNmJa: '成人集中治療室',
    cdNmZh: '成人重症监护室',
    cmt: '메뉴얼 표기는 "중환자실". 홈페이지 표기를 따랐다.',
  },
  {
    tp: 'asm06',
    tpNm: '중환자실',
    tpNmEn: 'Intensive Care',
    tpNmJa: '集中治療室',
    tpNmZh: '重症监护',
    cd: '20',
    cdNm: '신생아 중환자실',
    cdNmEn: 'Neonatal Intensive Care Unit',
    cdNmJa: '新生児集中治療室',
    cdNmZh: '新生儿重症监护室',
  },

  // ── asm07 정신건강 (웹 4개 중 2개. 우울증 외래·치매는 API 에 없다) ──
  {
    tp: 'asm07',
    tpNm: '정신건강',
    tpNmEn: 'Mental Health',
    tpNmJa: '精神健康',
    tpNmZh: '精神健康',
    cd: '04',
    cdNm: '의료급여정신과',
    cdNmEn: 'Medical Aid Psychiatry',
    cdNmJa: '医療給付精神科',
    cdNmZh: '医疗补助精神科',
  },
  {
    tp: 'asm07',
    tpNm: '정신건강',
    tpNmEn: 'Mental Health',
    tpNmJa: '精神健康',
    tpNmZh: '精神健康',
    cd: '22',
    cdNm: '정신건강 입원영역',
    cdNmEn: 'Mental Health Inpatient Care',
    cdNmJa: 'メンタルヘルス入院領域',
    cdNmZh: '精神健康住院领域',
  },

  // ── asm08 기타 (웹 4개 중 1개. 수혈·결핵·영상검사는 API 에 없다) ──
  {
    tp: 'asm08',
    tpNm: '기타',
    tpNmEn: 'Other',
    tpNmJa: 'その他',
    tpNmZh: '其他',
    cd: '21',
    cdNm: '마취',
    cdNmEn: 'Anesthesia',
    cdNmJa: '麻酔',
    cdNmZh: '麻醉',
  },

  // ── asm09 난임시술 의료기관 — API 가 항목을 하나도 안 줘서 **행이 없다** ──
];

export const HIRA_CODES: HiraCodeSeed[] = [...ASSESSMENTS];
