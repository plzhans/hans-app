import type {
  AddressCodeItem,
  AddressCodeResponse,
  EquipmentCodeItem,
  EquipmentCodeResponse,
  InstitutionClassCodeItem,
  InstitutionClassCodeResponse,
  SearchCodeItem,
  SearchCodeResponse,
  SubjectCodeItem,
  SubjectCodeResponse,
} from '@krdata/hira';

/**
 * HIRA 코드 종류.
 *
 * 원본 API 는 코드 종류마다 엔드포인트가 따로 있고(codeInfoService 6종) 필드명도 제각각이다
 * (addrCd / clCd / dgsbjtCd / oftCd / srchCd). 우리는 테이블과 엔드포인트를 하나로 합치고
 * 이 값(tp)으로 종류를 가른다.
 *
 * tp 는 API 가 주는 값이 아니라 우리가 붙이는 구분자다. specialty 와 special 은 원본 필드명이
 * 둘 다 srchCd 라, tp 가 없으면 애초에 구분되지 않는다.
 */
export const HIRA_CODE_TYPES = [
  'addr',
  'class',
  'subject',
  'equipment',
  'specialty',
  'special',
] as const;

export type HiraCodeType = (typeof HIRA_CODE_TYPES)[number];

export function isHiraCodeType(value: string): value is HiraCodeType {
  return (HIRA_CODE_TYPES as readonly string[]).includes(value);
}

/** hira_code 한 행. Prisma 모델의 부분집합이다. */
export interface HiraCodeRow {
  cd: string;
  cd_nm: string | null;
  cd_cmt: string | null;
}

/** 코드 종류별 원본 item 타입. tp 에 따라 필드명이 다르다. */
export type HiraCodeItem =
  | AddressCodeItem
  | InstitutionClassCodeItem
  | SubjectCodeItem
  | EquipmentCodeItem
  | SearchCodeItem;

/** 코드 종류별 원본 응답 타입. 구조는 같고 item 만 다르다. */
export type HiraCodeResponse =
  | AddressCodeResponse
  | InstitutionClassCodeResponse
  | SubjectCodeResponse
  | EquipmentCodeResponse
  | SearchCodeResponse;

interface HiraCodeTypeDef {
  /** 코드 종류명. 원본 API 에는 없는 우리 라벨이다. */
  readonly tpNm: string;

  /**
   * DB 행 → **원본 API 와 같은 필드명**의 item.
   * 리터럴 객체에 생성 타입을 붙였으므로, 스펙에서 필드명이 바뀌면 여기서 컴파일 에러가 난다.
   */
  readonly toItem: (row: HiraCodeRow) => HiraCodeItem;
}

/** tp ↔ 원본 필드명의 대응표. 이 매핑이 있는 곳은 여기 한 곳뿐이다. */
export const HIRA_CODE_TYPE_DEFS: Record<HiraCodeType, HiraCodeTypeDef> = {
  addr: {
    tpNm: '주소코드',
    toItem: (row): AddressCodeItem => ({
      addrCd: row.cd,
      addrCdNm: row.cd_nm ?? undefined,
    }),
  },
  class: {
    tpNm: '의료기관종별코드',
    toItem: (row): InstitutionClassCodeItem => ({
      clCd: row.cd,
      clCdNm: row.cd_nm ?? undefined,
    }),
  },
  subject: {
    tpNm: '진료과목코드',
    toItem: (row): SubjectCodeItem => ({
      dgsbjtCd: row.cd,
      dgsbjtCdNm: row.cd_nm ?? undefined,
      dgsbjtCdCmmt: row.cd_cmt ?? undefined,
    }),
  },
  equipment: {
    tpNm: '장비코드',
    toItem: (row): EquipmentCodeItem => ({
      oftCd: row.cd,
      oftCdNm: row.cd_nm ?? undefined,
    }),
  },
  specialty: {
    tpNm: '전문병원코드',
    toItem: (row): SearchCodeItem => ({
      srchCd: row.cd,
      srchCdNm: row.cd_nm ?? undefined,
      srchCdCmmt: row.cd_cmt ?? undefined,
    }),
  },
  special: {
    tpNm: '특수진료코드',
    toItem: (row): SearchCodeItem => ({
      srchCd: row.cd,
      srchCdNm: row.cd_nm ?? undefined,
      srchCdCmmt: row.cd_cmt ?? undefined,
    }),
  },
};
