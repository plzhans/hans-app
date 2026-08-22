import { Injectable } from '@nestjs/common';

import type { MirrorTableCount } from '../common/mirror-section';
import { HiraMirrorDashboardRepository } from './hira-mirror-dashboard.repository';

const HOSPITAL_LIST_PATH = '/hira/hospitals';

const GROUP_HOSPITAL = '병원';
const GROUP_CODE = '코드';

/**
 * hira_code 의 tp → 라벨. **딱 이 6종뿐이다**(codeInfoService 6종, HiraCode 주석 참고).
 * asm01~09 는 시드가 채운 행이라 여기 없다 — 없는 tp 는 countCodesByTp() 결과에서 조용히
 * 버려진다(코드 대시보드는 "외부에서 연동해 온 것"만 보여준다).
 */
const CODE_TP_LABEL: Record<string, string> = {
  addr: '주소코드',
  class: '의료기관종별코드',
  subject: '진료과목코드',
  equipment: '장비코드',
  specialty: '전문병원코드',
  special: '특수진료코드',
};

/**
 * HIRA 연동 데이터 대시보드 — 테이블(또는 op 로 쪼개진 논리 테이블)별 건수 한 벌.
 *
 * **순서·라벨은 HiraMirrorDetailService 의 섹션 순서와 그대로 맞춘다** — 상세 화면에서
 * 정한 배치(정규화 미러와 그 원본 op 를 나란히 두는 것)를 대시보드에서도 다시 겪지
 * 않게 하려는 것이다. "목록 보기" 는 병원(기본 정보) 한 줄에만 있다 — 그것만 실제
 * 목록 화면(MirrorHospitals)이 있고, 나머지는 아직 건수만 본다.
 *
 * **병원 미러와 코드마스터는 group 으로 갈린다.** 병원 쪽은 병원 하나하나에 딸린 데이터고,
 * 코드 쪽(hira_code/hira_npay_code/hira_region)은 병원과 무관한 참조표라 성격이 다르다 —
 * 한 표에 섞으면 "병원 수" 옆에 "코드 수" 가 나란히 앉아 서로 비교되는 것처럼 읽힌다.
 */
@Injectable()
export class HiraMirrorDashboardService {
  constructor(private readonly repo: HiraMirrorDashboardRepository) {}

  async getTableCounts(): Promise<MirrorTableCount[]> {
    const [
      hospitals,
      ops,
      subjects,
      srch,
      equipments,
      assessments,
      npay,
      codesByTp,
      npayCodes,
      regions,
    ] = await Promise.all([
      this.repo.countHospitals(),
      this.repo.countDetailOps(),
      this.repo.countSubjects(),
      this.repo.countSrch(),
      this.repo.countEquipments(),
      this.repo.countAssessments(),
      this.repo.countNpay(),
      this.repo.countCodesByTp(),
      this.repo.countNpayCodes(),
      this.repo.countRegions(),
    ]);

    const op = (code: string, label: string): MirrorTableCount => ({
      key: `detail:${code}`,
      group: GROUP_HOSPITAL,
      label,
      count: ops[code] ?? 0,
    });

    const code = (tp: string): MirrorTableCount => ({
      key: `code:${tp}`,
      group: GROUP_CODE,
      label: CODE_TP_LABEL[tp],
      count: codesByTp[tp] ?? 0,
    });

    return [
      {
        key: 'base',
        group: GROUP_HOSPITAL,
        label: '기본 정보',
        count: hospitals,
        listPath: HOSPITAL_LIST_PATH,
      },
      op('info', '상세 정보'),
      { key: 'subject', group: GROUP_HOSPITAL, label: '진료 과목', count: subjects },
      op('subject', '진료 과목(상세)'),
      op('specialist', '전문의'),
      op('special', '특수 진료'),
      { key: 'srch', group: GROUP_HOSPITAL, label: '전문병원, 특수진료', count: srch },
      { key: 'equipment', group: GROUP_HOSPITAL, label: '보유 장비', count: equipments },
      op('equipment', '장비 정보'),
      op('facility', '시설 정보'),
      op('specialty', '전문 병원'),
      op('nursing', '간호 등급'),
      op('etc-staff', '기타 인력'),
      op('food', '식대 가산'),
      op('transport', '교통 정보'),
      { key: 'asm', group: GROUP_HOSPITAL, label: '병원 평가', count: assessments },
      { key: 'npay', group: GROUP_HOSPITAL, label: '비급여', count: npay },
      op('npay-web', '비급여(홈페이지)'),
      code('addr'),
      code('class'),
      code('subject'),
      code('equipment'),
      code('specialty'),
      code('special'),
      { key: 'npay-code', group: GROUP_CODE, label: '비급여 코드마스터', count: npayCodes },
      { key: 'region', group: GROUP_CODE, label: '지역 목록', count: regions },
    ];
  }
}
