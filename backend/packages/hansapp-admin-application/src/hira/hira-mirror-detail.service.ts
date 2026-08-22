import { Injectable } from '@nestjs/common';
import {
  PrismaService,
  type HiraHospitalAsm,
  type HiraHospitalDetail,
  type HiraHospitalNpay,
} from '@hansapp/data';

import {
  flattenFields,
  isEmptyPayload,
  toSectionItems,
  type MirrorSection,
  type MirrorSectionItem,
} from '../common/mirror-section';
import { AdminHiraMirrorNotFoundError } from '../error';
import { HiraMirrorDetailRepository } from './hira-mirror-detail.repository';

export interface HiraMirrorHospitalDetail {
  ykiho: string;
  name: string | null;
  syncedAt: string;
  /** 이 요양기호로 통합병원(healthcare_hospital)이 만들어져 있으면 그 id. 없으면 null. */
  linkedHealthcareHospitalId: number | null;
  sections: MirrorSection[];
}

/**
 * 필드 보기에서 뺄 키. **ykiho 는 상세 화면 최상위(헤더)에 이미 나와 있다** — 섹션마다
 * 또 보여주면 모든 행이 같은 값을 반복하는 열/줄이 된다. JSON 전체 보기(raw)는 원본
 * 그대로 두므로 여기서 빠져도 원본을 잃지 않는다(flattenFields 주석 참고).
 */
const OMIT_ID = ['ykiho'] as const;

/**
 * 목록형 응답(오퍼레이션 11종·비급여·평가)에서 뺄 키. **병원 단위 값이 행마다 반복된다**
 * (스키마 주석 참고 — urlAddr 도 같은 이유로 반복된다고 적혀 있다) — 병원명(yadmNm)·
 * 종별코드/명(clCd·clCdNm)은 이미 상세 화면 헤더·기본정보 섹션에 있어 행마다 또 보일
 * 이유가 없다. **기본정보(base) 섹션과 정규화 표(진료과목·장비·전문병원코드)는 이 필터를
 * 안 쓴다** — 전자는 원본 레코드 자체고, 후자는 애초에 이 필드들이 없다.
 */
const OMIT_REPEATED = [...OMIT_ID, 'yadmNm', 'clCd', 'clCdNm'] as const;

/** hira_hospital_detail.op 라벨. 스키마 정본은 HiraHospitalDetail.op 주석이다. */
const OP_LABEL: Record<string, string> = {
  info: '상세 정보',
  facility: '시설 정보',
  equipment: '장비 정보',
  special: '특수 진료',
  specialty: '전문 병원',
  nursing: '간호 등급',
  food: '식대 가산',
  subject: '진료 과목(상세)',
  specialist: '전문의',
  'etc-staff': '기타 인력',
  transport: '교통 정보',
  'npay-web': '비급여(홈페이지)',
};

/** asm_01~24 컬럼만 뽑는다(healthcare-hospital-detail.service.ts 의 extractAsmValues 와 같은 방식). */
function asmGradeColumns(asm: HiraHospitalAsm): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(asm)) {
    if (/^asm_\d{2}$/.test(key) && typeof value === 'string') {
      out[key] = value;
    }
  }
  return out;
}

/**
 * 평가 한 건 → 필드. **컬럼(clCd + asm_01~24)과 원본 data 를 한 층으로 합친다** — data 를
 * 그대로 flattenFields 에 넘기면 "data" 라는 필드 하나에 JSON 문자열이 통째로 뭉개져 담긴다
 * (toSectionItems 주석의 "장비정보" 문제와 같은 종류다).
 */
function assessmentItem(asm: HiraHospitalAsm): MirrorSectionItem {
  const merged = {
    clCd: asm.clCd,
    ...asmGradeColumns(asm),
    ...(asm.data as Record<string, unknown>),
  };
  return { fields: flattenFields(merged, OMIT_REPEATED), raw: asm.data };
}

/** 비급여 한 건 → 필드. 정규화 컬럼(sno·npayCd)과 원본 data 를 한 층으로 합친다(assessmentItem 과 같은 이유). */
function npayItem(row: HiraHospitalNpay): MirrorSectionItem {
  const merged = {
    sno: row.sno,
    npayCd: row.npayCd,
    ...(row.data as Record<string, unknown>),
  };
  return { fields: flattenFields(merged, OMIT_REPEATED), raw: row.data };
}

/**
 * op 오퍼레이션 하나 → 섹션. data 가 배열(여러 행짜리 오퍼레이션)이면 원소마다 항목을
 * 나눈다 — 그래야 항목별로 필드가 제대로 펼쳐진다(toSectionItems 주석 참고).
 */
function opSection(op: string, row: HiraHospitalDetail | undefined): MirrorSection {
  return {
    key: `detail:${op}`,
    label: OP_LABEL[op],
    queried: !!row,
    empty: row ? isEmptyPayload(row.data) : true,
    syncedAt: row?.syncedAt.toISOString() ?? null,
    items: row ? toSectionItems(row.data, OMIT_REPEATED) : [],
  };
}

/**
 * npay-web 은 다른 op 와 봉투 모양이 다르다 — `{ ykiho, npayPubList[] }` 하나짜리 객체다
 * (스키마 주석 참고). 그대로 toSectionItems 에 넘기면 객체 하나로 보여 npayPubList 가
 * 그 안의 필드 하나(값이 JSON 배열 통째로 뭉개진)로 접힌다. **npayPubList 자체를 항목
 * 목록으로 편다** — 그래야 비급여 항목 하나하나가 표의 행이 된다(요청 그대로).
 */
function npayWebSection(row: HiraHospitalDetail | undefined): MirrorSection {
  const envelope = row?.data as { ykiho?: string; npayPubList?: unknown[] } | undefined;
  const list = envelope?.npayPubList;
  return {
    key: 'detail:npay-web',
    label: OP_LABEL['npay-web'],
    queried: !!row,
    // 빈 배열이면 "긁었는데 0건"이다(스키마 주석) — 행이 없는 것과는 다르다.
    empty: row ? !list || list.length === 0 : true,
    syncedAt: row?.syncedAt.toISOString() ?? null,
    items: list ? toSectionItems(list, OMIT_REPEATED) : [],
  };
}

/**
 * HIRA 병원 미러 상세 조립.
 *
 * **healthcare_hospital 과 무관하다.** 통합병원이 이 요양기호로 만들어졌는지는 참고 링크
 * 하나로만 보여주고(linkedHealthcareHospitalId), 조회 자체는 HIRA 미러만 본다 — 관리자가
 * "HIRA 쪽 원본이 뭘 가지고 있나" 를 확인하는 자리라서다.
 *
 * **섹션 순서는 정규화 미러와 그 원본 op 를 나란히 둔다.** 진료과목→진료과목(상세),
 * 보유장비→장비정보, 병원평가 옆에 비급여→비급여(홈페이지) 처럼, 같은 주제를 다루는
 * 두 표를 붙여야 서로 대조하기 쉽다 — 관리자 요청으로 정한 순서다.
 */
@Injectable()
export class HiraMirrorDetailService {
  constructor(
    private readonly repo: HiraMirrorDetailRepository,
    private readonly prisma: PrismaService,
  ) {}

  async get(ykiho: string): Promise<HiraMirrorHospitalDetail> {
    const hospital = await this.repo.findHospital(ykiho);
    if (!hospital) {
      throw new AdminHiraMirrorNotFoundError();
    }

    const [detailOps, subjects, equipments, srch, assessment, npay, linked] = await Promise.all([
      this.repo.findDetailOps(ykiho),
      this.repo.findSubjects(ykiho),
      this.repo.findEquipments(ykiho),
      this.repo.findSrch(ykiho),
      this.repo.findAssessment(ykiho),
      this.repo.findNpay(ykiho, 50),
      this.prisma.healthcareHospital.findFirst({ where: { ykiho }, select: { id: true } }),
    ]);

    const data = hospital.data as Record<string, unknown>;
    const opByCode = new Map(detailOps.map((row) => [row.op, row]));
    const op = (code: string) => opSection(code, opByCode.get(code));

    const sections: MirrorSection[] = [
      {
        key: 'base',
        label: '기본 정보',
        queried: true,
        empty: isEmptyPayload(data),
        syncedAt: hospital.syncedAt.toISOString(),
        items: [{ fields: flattenFields(data, OMIT_ID), raw: data }],
      },
      op('info'),
      {
        key: 'subject',
        label: '진료 과목',
        queried: true,
        empty: subjects.length === 0,
        syncedAt: subjects[0]?.syncedAt.toISOString() ?? null,
        items: subjects.map((s) => ({ fields: flattenFields(s, OMIT_ID), raw: s })),
      },
      op('subject'),
      op('specialist'),
      op('special'),
      {
        key: 'srch',
        label: '전문병원, 특수진료',
        queried: true,
        empty: srch.length === 0,
        syncedAt: srch[0]?.syncedAt.toISOString() ?? null,
        items: srch.map((s) => ({ fields: flattenFields(s, OMIT_ID), raw: s })),
      },
      {
        key: 'equipment',
        label: '보유 장비',
        queried: true,
        empty: equipments.length === 0,
        syncedAt: equipments[0]?.syncedAt.toISOString() ?? null,
        items: equipments.map((e) => ({ fields: flattenFields(e, OMIT_ID), raw: e })),
      },
      op('equipment'),
      op('facility'),
      op('specialty'),
      op('nursing'),
      op('etc-staff'),
      op('food'),
      op('transport'),
      {
        key: 'asm',
        // 평가는 전수 목록형 sync 라(스키마 주석 참고) 행이 없으면 "평가 대상이 아니다".
        label: '병원 평가(없으면 평가 대상 아님)',
        queried: true,
        empty: !assessment,
        syncedAt: assessment?.syncedAt.toISOString() ?? null,
        items: assessment ? [assessmentItem(assessment)] : [],
      },
      {
        key: 'npay',
        label: `비급여(최대 50건 표시, 전체 ${npay.total}건)`,
        queried: true,
        empty: npay.total === 0,
        syncedAt: npay.rows[0]?.syncedAt.toISOString() ?? null,
        items: npay.rows.map(npayItem),
      },
      npayWebSection(opByCode.get('npay-web')),
    ];

    return {
      ykiho: hospital.ykiho,
      name: typeof data.yadmNm === 'string' ? data.yadmNm : null,
      syncedAt: hospital.syncedAt.toISOString(),
      linkedHealthcareHospitalId: linked?.id ?? null,
      sections,
    };
  }
}
