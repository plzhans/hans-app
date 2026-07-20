/**
 * 비급여 중분류(mdivCd) → 표시 그룹.
 *
 * 심평원 중분류가 48종이라 그대로는 책갈피 탭으로 너무 많다. 일반인이 실제로 찾는 단위로 묶는다.
 * **코드 앞자리가 계열이라** 이름(공백·표기 변형이 있다)이 아니라 코드로 묶는다 —
 * 1032*=MRI, 1025*=초음파, 1023*=기능검사, 1091*=처치수술 …
 *
 * 라벨은 i18n 이 준다(clinic.npay.group.<key>). 여기선 키와 소속만 정한다.
 */
export type NpayGroupKey =
  | 'test'
  | 'vaccine'
  | 'ultrasound'
  | 'mri'
  | 'physicalTherapy'
  | 'room'
  | 'dental'
  | 'docs'
  | 'etc';

/** 책갈피 탭에 뜨는 순서. 'etc'(기타)는 항상 마지막. */
export const NPAY_GROUP_ORDER: NpayGroupKey[] = [
  'test',
  'vaccine',
  'ultrasound',
  'mri',
  'physicalTherapy',
  'room',
  'dental',
  'docs',
  'etc',
];

/**
 * 중분류코드 → 그룹. 못 맞추면 'etc'.
 *
 * 치료재료(1992A)·처치수술(1091*)은 항목이 많지만 일반인이 이름으로 찾지 않아(스텐트·임플란트
 * 브랜드명) 'etc' 로 둔다. 한방·교육상담·주사·미용도 'etc'.
 */
export function npayGroup(mdivCd: string | undefined): NpayGroupKey {
  if (!mdivCd) return 'etc';
  const p4 = mdivCd.slice(0, 4);

  if (mdivCd === '1010A') return 'room'; // 상급병실료
  if (mdivCd === '1993A') return 'docs'; // 제증명수수료
  if (mdivCd === '1991C') return 'vaccine'; // 예방접종료
  if (p4 === '1032') return 'mri'; // 자기공명영상(기본·특수)
  if (p4 === '1025') return 'ultrasound'; // 초음파(진단·유도·특수·기본)
  if (mdivCd === '1070Z') return 'physicalTherapy'; // 이학요법료
  if (mdivCd === '1100Z' || mdivCd === '1180Z') return 'dental'; // 치과 처치수술·보철
  // 검체(1021Z)·병리(1022Z)·기능검사(1023*)·내시경생검(1024Z)
  if (
    mdivCd === '1021Z' ||
    mdivCd === '1022Z' ||
    p4 === '1023' ||
    mdivCd === '1024Z'
  )
    return 'test';

  return 'etc';
}
