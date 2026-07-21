import { Injectable } from '@nestjs/common';
import { PrismaService } from '@hansapi/data';

import type {
  HealthcareHospitalIndexRow,
  I18nRow,
} from './healthcare-hospital-doc';

/**
 * 색인용 병원 읽기. **keyset 커서**(id > cursor)로 대량을 훑고, 배치마다 자식·i18n·asm 을
 * 한 번에 모아 조립한다(hospital-i18n-export.repository 의 커서 패턴과 같은 결).
 *
 * 상세 조회 API 의 offset(skip/take)이 아니라 keyset 을 쓰는 이유는 8만 건을 끝까지 흘려도
 * 뒤 페이지가 느려지지 않게 하기 위해서다.
 */
@Injectable()
export class HealthcareHospitalIndexRepository {
  constructor(private readonly prisma: PrismaService) {}

  private static readonly INCLUDE = {
    subjects: true,
    equipments: true,
    capabilities: true,
    hours: true,
    staff: true,
    beds: true,
  } as const;

  /** 색인 대상(활성 병원) 총 건수. 진행률 표시용으로 색인 전에 1회 센다. */
  countActive(): Promise<number> {
    return this.prisma.healthcareHospital.count({
      where: { status: 'active' },
    });
  }

  /** 시군구 cd → 시도 cd. 색인 전 1회 로드해 시도 롤업에 쓴다(RegionCache 대신). */
  async loadRegionParents(): Promise<Map<string, string>> {
    const rows = await this.prisma.regionCode.findMany({
      where: { level: 'sggu' },
      select: { cd: true, parentCd: true },
    });
    const map = new Map<string, string>();
    for (const row of rows) {
      if (row.parentCd) {
        map.set(row.cd, row.parentCd);
      }
    }
    return map;
  }

  /** id > cursor 인 활성 병원 한 배치를 자식·i18n·asm 까지 묶어 반환. 빈 배열이면 끝. */
  async loadBatch(
    cursor: number,
    take: number,
  ): Promise<HealthcareHospitalIndexRow[]> {
    const hospitals = await this.prisma.healthcareHospital.findMany({
      where: { id: { gt: cursor }, status: 'active' },
      orderBy: { id: 'asc' },
      take,
      include: HealthcareHospitalIndexRepository.INCLUDE,
    });
    return this.assemble(hospitals);
  }

  /** 특정 병원 1건(비활성 포함하지 않음 — 색인은 active 만). 없으면 null. */
  async loadOne(id: number): Promise<HealthcareHospitalIndexRow | null> {
    const hospital = await this.prisma.healthcareHospital.findFirst({
      where: { id, status: 'active' },
      include: HealthcareHospitalIndexRepository.INCLUDE,
    });
    if (!hospital) {
      return null;
    }
    const [row] = await this.assemble([hospital]);
    return row ?? null;
  }

  /** 병원 배열에 i18n·asm 을 붙여 HealthcareHospitalIndexRow[] 로 만든다. */
  private async assemble(
    hospitals: HealthcareHospitalWithChildren[],
  ): Promise<HealthcareHospitalIndexRow[]> {
    if (hospitals.length === 0) {
      return [];
    }

    const ids = hospitals.map((h) => h.id);
    const ykihos = hospitals
      .map((h) => h.ykiho)
      .filter((v): v is string => v !== null);

    const [i18nRows, asmRows] = await Promise.all([
      this.prisma.healthcareHospitalI18n.findMany({
        where: { hospitalId: { in: ids } },
      }),
      ykihos.length
        ? this.prisma.hiraHospitalAsm.findMany({
            where: { ykiho: { in: ykihos } },
          })
        : Promise.resolve([]),
    ]);

    const i18nByHospital = new Map<number, I18nRow[]>();
    for (const row of i18nRows) {
      const list = i18nByHospital.get(row.hospitalId) ?? [];
      list.push({
        lang: row.lang,
        name: row.name,
        intro: row.intro,
        notice: row.notice,
        directions: row.directions,
        transport: row.transport,
      });
      i18nByHospital.set(row.hospitalId, list);
    }

    const asmByYkiho = new Map<string, Record<string, string | null>>();
    for (const row of asmRows) {
      asmByYkiho.set(
        row.ykiho,
        row as unknown as Record<string, string | null>,
      );
    }

    return hospitals.map((hospital) => ({
      hospital: hospital as unknown as HealthcareHospitalIndexRow['hospital'],
      i18n: i18nByHospital.get(hospital.id) ?? [],
      asm: hospital.ykiho ? (asmByYkiho.get(hospital.ykiho) ?? null) : null,
    }));
  }
}

/** loadBatch/loadOne 의 Prisma 반환 원소(include 포함). 구조적으로만 쓴다. */
type HealthcareHospitalWithChildren = {
  id: number;
  ykiho: string | null;
} & Record<string, unknown>;
