import { Injectable } from '@nestjs/common';

import { HealthcareHospitalMetaRepository } from './healthcare-hospital-meta.repository';

export interface HospitalMetaOption {
  code: string;
  name: string;
}

export interface HospitalMetaRegion {
  code: string;
  name: string;
  shortName: string | null;
  level: string;
  parentCode: string | null;
}

/**
 * 관리자 병원 검색 필터에 쓰는 코드 이름표 한 벌.
 *
 * **medifinder-web 의 검색 필터(SearchFilters)가 쓰는 것과 같은 갈래다** — 종별·지역·
 * 등급·진료과목·전문의·전문병원·병원평가·보유장비·특수진료. 다만 등급(tier)은 코드표가
 * 아니라 고정된 5값(healthcare_hospital.tier 주석 참고)이라 프론트가 직접 이름을 붙인다.
 */
export interface HospitalMeta {
  classes: HospitalMetaOption[];
  subjects: HospitalMetaOption[];
  equipments: HospitalMetaOption[];
  specialties: HospitalMetaOption[];
  specials: HospitalMetaOption[];
  assessments: HospitalMetaOption[];
  regions: HospitalMetaRegion[];
}

@Injectable()
export class HealthcareHospitalMetaService {
  constructor(private readonly repo: HealthcareHospitalMetaRepository) {}

  async getMeta(): Promise<HospitalMeta> {
    const [classes, subjects, equipments, specialties, specials, assessmentCodes, regions] =
      await Promise.all([
        this.repo.findCodes('class'),
        this.repo.findCodes('subject'),
        this.repo.findCodes('equipment'),
        this.repo.findCodes('specialty'),
        this.repo.findCodes('special'),
        this.repo.findAssessmentCodes(),
        this.repo.findRegions(),
      ]);

    return {
      classes: classes.map((c) => ({ code: c.cd, name: c.title })),
      subjects: subjects.map((c) => ({ code: c.cd, name: c.title })),
      equipments: equipments.map((c) => ({ code: c.cd, name: c.title })),
      specialties: specialties.map((c) => ({ code: c.cd, name: c.title })),
      specials: specials.map((c) => ({ code: c.cd, name: c.title })),
      assessments: assessmentCodes.map((c) => ({ code: c.cd, name: c.cdNm ?? c.cd })),
      regions: regions.map((r) => ({
        code: r.cd,
        name: r.nm,
        shortName: r.shortNm,
        level: r.level,
        parentCode: r.parentCd,
      })),
    };
  }
}
