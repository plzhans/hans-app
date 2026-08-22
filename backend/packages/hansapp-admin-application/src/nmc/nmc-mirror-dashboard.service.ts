import { Injectable } from '@nestjs/common';

import type { MirrorTableCount } from '../common/mirror-section';
import { NmcMirrorDashboardRepository } from './nmc-mirror-dashboard.repository';

const HOSPITAL_LIST_PATH = '/nmc/hospitals';

const GROUP_HOSPITAL = '병원';
const GROUP_CODE = '코드';

/**
 * NMC 연동 데이터 대시보드 — 테이블별 건수 한 벌. 순서·라벨은 NmcMirrorDetailService 의
 * 섹션과 맞춘다. "목록 보기" 는 병원(기본목록) 한 줄에만 있다(HiraMirrorDashboardService
 * 와 같은 이유).
 *
 * **병원 미러와 코드마스터(nmc_code/nmc_region)는 group 으로 갈린다**(HiraMirrorDashboardService
 * 와 같은 이유 — 병원 수와 코드 수는 비교 대상이 아니다).
 */
@Injectable()
export class NmcMirrorDashboardService {
  constructor(private readonly repo: NmcMirrorDashboardRepository) {}

  async getTableCounts(): Promise<MirrorTableCount[]> {
    const [hospitals, basic, subjects, baby, codes, regions] = await Promise.all([
      this.repo.countHospitals(),
      this.repo.countBasic(),
      this.repo.countSubjects(),
      this.repo.countBaby(),
      this.repo.countCodes(),
      this.repo.countRegions(),
    ]);

    return [
      {
        key: 'base',
        group: GROUP_HOSPITAL,
        label: '기본목록(fulldown)',
        count: hospitals,
        listPath: HOSPITAL_LIST_PATH,
      },
      { key: 'basic', group: GROUP_HOSPITAL, label: '상세기본정보(basic)', count: basic },
      { key: 'subject', group: GROUP_HOSPITAL, label: '진료과목', count: subjects },
      { key: 'baby', group: GROUP_HOSPITAL, label: '달빛어린이병원', count: baby },
      { key: 'code', group: GROUP_CODE, label: '코드마스터', count: codes },
      { key: 'region', group: GROUP_CODE, label: '지역 목록', count: regions },
    ];
  }
}
