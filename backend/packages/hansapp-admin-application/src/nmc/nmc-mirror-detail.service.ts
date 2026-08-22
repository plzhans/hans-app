import { Injectable } from '@nestjs/common';
import { PrismaService } from '@hansapp/data';

import {
  flattenFields,
  isEmptyPayload,
  toSectionItems,
  type MirrorSection,
} from '../common/mirror-section';
import { AdminNmcMirrorNotFoundError } from '../error';
import { NmcMirrorDetailRepository } from './nmc-mirror-detail.repository';

export interface NmcMirrorHospitalDetail {
  hpid: string;
  name: string | null;
  syncedAt: string;
  /** 이 기관ID로 통합병원(healthcare_hospital)이 만들어져 있으면 그 id. 없으면 null. */
  linkedHealthcareHospitalId: number | null;
  sections: MirrorSection[];
}

/**
 * 필드 보기에서 뺄 키. **hpid 는 상세 화면 최상위(헤더)에 이미 나와 있다** — 섹션마다 또
 * 보여주면 모든 행이 같은 값을 반복하는 열/줄이 된다. JSON 전체 보기(raw)는 원본 그대로
 * 두므로 여기서 빠져도 원본을 잃지 않는다(flattenFields 주석 참고).
 */
const OMIT_ID = ['hpid'] as const;

/**
 * NMC 병원 미러 상세 조립.
 *
 * NMC 는 HIRA 처럼 오퍼레이션이 11개로 갈리지 않는다 — 기본목록(fulldown)·상세기본정보
 * (basic)·진료과목·달빛어린이 넷뿐이다. **basic 만 명시적인 "아직 안 받음" 표시가 있다**
 * (basicSyncedAt IS NULL). 진료과목·달빛어린이는 그런 표시가 없어 근사치로 다룬다
 * (MirrorSection.queried 주석 참고 — HiraMirrorDetailService 와 같은 결정).
 */
@Injectable()
export class NmcMirrorDetailService {
  constructor(
    private readonly repo: NmcMirrorDetailRepository,
    private readonly prisma: PrismaService,
  ) {}

  async get(hpid: string): Promise<NmcMirrorHospitalDetail> {
    const hospital = await this.repo.findHospital(hpid);
    if (!hospital) {
      throw new AdminNmcMirrorNotFoundError();
    }

    const [subjects, baby, linked] = await Promise.all([
      this.repo.findSubjects(hpid),
      this.repo.findBaby(hpid),
      this.prisma.healthcareHospital.findFirst({ where: { hpid }, select: { id: true } }),
    ]);

    const data = hospital.data as Record<string, unknown>;
    const basic = hospital.basic as Record<string, unknown> | null;

    const sections: MirrorSection[] = [
      {
        key: 'base',
        label: '기본목록(fulldown)',
        queried: true,
        empty: isEmptyPayload(data),
        syncedAt: hospital.syncedAt.toISOString(),
        items: toSectionItems(data, OMIT_ID),
      },
      {
        key: 'basic',
        label: '상세기본정보(basic)',
        queried: hospital.basicSyncedAt !== null,
        empty: basic ? isEmptyPayload(basic) : true,
        syncedAt: hospital.basicSyncedAt?.toISOString() ?? null,
        items: basic ? toSectionItems(basic, OMIT_ID) : [],
      },
      {
        key: 'subject',
        label: '진료과목',
        queried: true,
        empty: subjects.length === 0,
        syncedAt: subjects[0]?.syncedAt.toISOString() ?? null,
        items: subjects.map((s) => ({ fields: flattenFields(s, OMIT_ID), raw: s })),
      },
      {
        key: 'baby',
        // 달빛어린이 목록은 전수 sync(스키마 주석 참고)라, 행이 없으면 "달빛어린이병원이 아니다".
        label: '달빛어린이병원(없으면 대상 아님)',
        queried: true,
        empty: !baby,
        syncedAt: baby?.syncedAt.toISOString() ?? null,
        items: baby ? toSectionItems(baby.data, OMIT_ID) : [],
      },
    ];

    return {
      hpid: hospital.hpid,
      name: typeof data.dutyName === 'string' ? data.dutyName : null,
      syncedAt: hospital.syncedAt.toISOString(),
      linkedHealthcareHospitalId: linked?.id ?? null,
      sections,
    };
  }
}
