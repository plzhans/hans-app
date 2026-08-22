import { Injectable } from '@nestjs/common';
import type { HiraHospitalAsm } from '@hansapp/data';

import { AdminHospitalNotFoundError } from '../error';
import {
  HealthcareHospitalDetailRepository,
  type HospitalDetailModel,
} from './healthcare-hospital-detail.repository';

export interface HospitalAdminSubject {
  cd: string;
  name: string | null;
  declared: boolean;
  doctorCnt: number | null;
  specialistCnt: number | null;
}

export interface HospitalAdminEquipment {
  cd: string;
  name: string | null;
  cnt: number | null;
}

export interface HospitalAdminCapability {
  tp: string;
  cd: string;
  name: string | null;
}

export interface HospitalAdminHours {
  kind: string;
  day: number;
  openTime: string | null;
  closeTime: string | null;
  breakStart: string | null;
  breakEnd: string | null;
  receptionEnd: string | null;
}

export interface HospitalAdminStaff {
  doctorTotal: number | null;
  specialist: number | null;
  resident: number | null;
  intern: number | null;
  generalDoctor: number | null;
  dentist: number | null;
  oriental: number | null;
  midwife: number | null;
}

export interface HospitalAdminBeds {
  total: number | null;
  standard: number | null;
  higher: number | null;
  icu: number | null;
  emergency: number | null;
  operatingRoom: number | null;
  delivery: number | null;
  neonatal: number | null;
  isolation: number | null;
  psyOpen: number | null;
  psyClosed: number | null;
}

export interface HospitalAdminI18n {
  lang: string;
  name: string | null;
  intro: string | null;
  notice: string | null;
  directions: string | null;
}

/** 병원평가 항목 한 줄. grade 는 원본 그대로다('1'~'5'·'등급제외'·천식만 '양호'). */
export interface HospitalAdminAssessmentItem {
  code: string;
  name: string;
  grade: string;
}

/** 병원평가 묶음(급성질환·만성질환… hira_code tp=asm01~asm09). */
export interface HospitalAdminAssessmentGroup {
  code: string;
  name: string;
  items: HospitalAdminAssessmentItem[];
}

export interface HospitalAdminDetail {
  id: number;
  name: string;
  legalName: string;
  corpName: string | null;
  status: string;
  source: string;
  ykiho: string | null;
  hpid: string | null;
  classCd: string | null;
  className: string | null;
  regionCd: string | null;
  regionName: string | null;
  emdongNm: string | null;
  tier: string | null;
  addr: string | null;
  postNo: string | null;
  lat: number | null;
  lon: number | null;
  tel: string | null;
  homepage: string | null;
  estbDd: string | null;
  intro: string | null;
  notice: string | null;
  directions: string | null;
  parkQty: number | null;
  parkPaid: boolean | null;
  /** 원본 그대로의 대중교통 JSON({subway,bus,etc}). 관리자용이라 가공하지 않는다. */
  transport: unknown;
  emergencyYn: boolean;
  babyYn: boolean;
  builtAt: string;
  subjects: HospitalAdminSubject[];
  hours: HospitalAdminHours[];
  staff: HospitalAdminStaff | null;
  beds: HospitalAdminBeds | null;
  equipments: HospitalAdminEquipment[];
  capabilities: HospitalAdminCapability[];
  i18n: HospitalAdminI18n[];
  /** 병원평가 대상이 아니면(ykiho 없음·미러에 없음) null. */
  assessment: HospitalAdminAssessmentGroup[] | null;
}

/**
 * healthcare_hospital 관리자 상세.
 *
 * **화면 구성은 medifinder-web(공개 상세)이 다루는 내용을 참고했다** — 기본정보·진료과목·
 * 진료시간·규모(인력·병상·장비)·병원평가·위치/교통 여섯 갈래는 같다. 다만 이 계층은
 * `@hansapp/application` 을 의존하지 않기로 했으므로(코드표 캐시·평가 정규화 로직이 그쪽에
 * 있다), 코드 이름은 이 병원에 실제로 등장한 것만 그때그때 조회하고, 평가 등급은
 * **정규화하지 않고 원본 문자열 그대로** 낸다 — 관리자는 데이터를 감사하는 자리라 가공보다
 * 원본이 낫다.
 */
@Injectable()
export class HealthcareHospitalDetailService {
  constructor(private readonly repo: HealthcareHospitalDetailRepository) {}

  async get(id: number): Promise<HospitalAdminDetail> {
    const hospital = await this.repo.findHospital(id);
    if (!hospital) {
      throw new AdminHospitalNotFoundError();
    }

    const [i18n, assessment, codeNames, regionName] = await Promise.all([
      this.repo.findI18n(id),
      hospital.ykiho ? this.buildAssessment(hospital.ykiho) : Promise.resolve(null),
      this.repo.findCodeNames(collectCodePairs(hospital)),
      hospital.regionCd ? this.repo.findRegionName(hospital.regionCd) : Promise.resolve(null),
    ]);

    const codeName = (tp: string, cd: string): string | null =>
      codeNames.find((c) => c.tp === tp && c.cd === cd)?.title ?? null;

    return {
      id: hospital.id,
      name: hospital.name,
      legalName: hospital.legalName,
      corpName: hospital.corpName,
      status: hospital.status,
      source: hospital.source,
      ykiho: hospital.ykiho,
      hpid: hospital.hpid,
      classCd: hospital.classCd,
      className: hospital.classCd ? codeName('class', hospital.classCd) : null,
      regionCd: hospital.regionCd,
      regionName: regionName?.nm ?? null,
      emdongNm: hospital.emdongNm,
      tier: hospital.tier,
      addr: hospital.addr,
      postNo: hospital.postNo,
      lat: numOrNull(hospital.lat),
      lon: numOrNull(hospital.lon),
      tel: hospital.tel,
      homepage: hospital.homepage,
      estbDd: hospital.estbDd,
      intro: hospital.intro,
      notice: hospital.notice,
      directions: hospital.directions,
      parkQty: hospital.parkQty,
      parkPaid: hospital.parkPaid,
      transport: hospital.transport,
      emergencyYn: hospital.emergencyYn,
      babyYn: hospital.babyYn,
      builtAt: hospital.builtAt.toISOString(),
      subjects: hospital.subjects.map((s) => ({
        cd: s.subjectCd,
        name: codeName('subject', s.subjectCd),
        declared: s.declared,
        doctorCnt: s.doctorCnt,
        specialistCnt: s.specialistCnt,
      })),
      hours: hospital.hours.map((h) => ({
        kind: h.kind,
        day: h.day,
        openTime: h.openTime,
        closeTime: h.closeTime,
        breakStart: h.breakStart,
        breakEnd: h.breakEnd,
        receptionEnd: h.receptionEnd,
      })),
      staff: hospital.staff && {
        doctorTotal: hospital.staff.doctorTotal,
        specialist: hospital.staff.specialist,
        resident: hospital.staff.resident,
        intern: hospital.staff.intern,
        generalDoctor: hospital.staff.generalDoctor,
        dentist: hospital.staff.dentist,
        oriental: hospital.staff.oriental,
        midwife: hospital.staff.midwife,
      },
      beds: hospital.beds && {
        total: hospital.beds.total,
        standard: hospital.beds.standard,
        higher: hospital.beds.higher,
        icu: hospital.beds.icu,
        emergency: hospital.beds.emergency,
        operatingRoom: hospital.beds.operatingRoom,
        delivery: hospital.beds.delivery,
        neonatal: hospital.beds.neonatal,
        isolation: hospital.beds.isolation,
        psyOpen: hospital.beds.psyOpen,
        psyClosed: hospital.beds.psyClosed,
      },
      equipments: hospital.equipments.map((e) => ({
        cd: e.equipmentCd,
        name: codeName('equipment', e.equipmentCd),
        cnt: e.cnt,
      })),
      capabilities: hospital.capabilities.map((c) => ({
        tp: c.tp,
        cd: c.cd,
        name: codeName(c.tp, c.cd),
      })),
      i18n: i18n.map((row) => ({
        lang: row.lang,
        name: row.name,
        intro: row.intro,
        notice: row.notice,
        directions: row.directions,
      })),
      assessment,
    };
  }

  /**
   * 병원평가. **등급제외·미평가는 다르다**(hira_hospital_asm 스키마 주석 참고) — 여기서는
   * 값이 있는(NULL 아닌) 항목만 담아, "평가 자체를 안 한 것" 을 목록에서 자연히 뺀다.
   */
  private async buildAssessment(ykiho: string): Promise<HospitalAdminAssessmentGroup[] | null> {
    const asm = await this.repo.findAssessment(ykiho);
    if (!asm) {
      return null;
    }
    const codes = await this.repo.findAssessmentCodes();
    const values = extractAsmValues(asm);

    const groups = new Map<string, HospitalAdminAssessmentGroup>();
    for (const code of codes) {
      const grade = values[code.cd];
      if (grade == null) {
        continue;
      }
      let group = groups.get(code.tp);
      if (!group) {
        group = { code: code.tp, name: code.tpNm, items: [] };
        groups.set(code.tp, group);
      }
      group.items.push({ code: code.cd, name: code.cdNm ?? code.cd, grade });
    }
    return [...groups.values()];
  }
}

function collectCodePairs(hospital: HospitalDetailModel): { tp: string; cd: string }[] {
  const pairs: { tp: string; cd: string }[] = [];
  if (hospital.classCd) {
    pairs.push({ tp: 'class', cd: hospital.classCd });
  }
  for (const s of hospital.subjects) {
    pairs.push({ tp: 'subject', cd: s.subjectCd });
  }
  for (const e of hospital.equipments) {
    pairs.push({ tp: 'equipment', cd: e.equipmentCd });
  }
  for (const c of hospital.capabilities) {
    pairs.push({ tp: c.tp, cd: c.cd });
  }
  return pairs;
}

/** hira_hospital_asm 의 asm_01…24 컬럼만 뽑아 {'01': grade} 로 편다. */
function extractAsmValues(asm: HiraHospitalAsm): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(asm)) {
    if (/^asm_\d{2}$/.test(key)) {
      out[key.slice(4)] = value as string | null;
    }
  }
  return out;
}

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}
