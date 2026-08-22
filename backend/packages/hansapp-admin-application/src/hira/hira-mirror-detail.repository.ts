import { Injectable } from '@nestjs/common';
import {
  PrismaService,
  type HiraHospital,
  type HiraHospitalAsm,
  type HiraHospitalDetail,
  type HiraHospitalEquipment,
  type HiraHospitalNpay,
  type HiraHospitalSrch,
  type HiraHospitalSubject,
} from '@hansapp/data';

/**
 * HIRA 병원 미러 상세. **한 요양기호(ykiho)에 딸린 미러 표 전부를 모은다** — 기본목록
 * 하나(hira_hospital)와, 오퍼레이션별로 갈린 나머지(진료과목·장비·검색코드·평가·비급여·
 * 11종 상세)를 각각 읽는다. 조립(섹션으로 나누고 조회여부를 가리는 일)은 서비스가 한다.
 */
@Injectable()
export class HiraMirrorDetailRepository {
  constructor(private readonly prisma: PrismaService) {}

  findHospital(ykiho: string): Promise<HiraHospital | null> {
    return this.prisma.hiraHospital.findUnique({ where: { ykiho } });
  }

  /** (병원,오퍼레이션) 한 쌍이 한 행이다. 없는 오퍼레이션은 "아직 안 받은 것"(스키마 주석 참고). */
  findDetailOps(ykiho: string): Promise<HiraHospitalDetail[]> {
    return this.prisma.hiraHospitalDetail.findMany({ where: { ykiho }, orderBy: { op: 'asc' } });
  }

  findSubjects(ykiho: string): Promise<HiraHospitalSubject[]> {
    return this.prisma.hiraHospitalSubject.findMany({
      where: { ykiho },
      orderBy: { dgsbjtCd: 'asc' },
    });
  }

  findEquipments(ykiho: string): Promise<HiraHospitalEquipment[]> {
    return this.prisma.hiraHospitalEquipment.findMany({
      where: { ykiho },
      orderBy: { oftCd: 'asc' },
    });
  }

  findSrch(ykiho: string): Promise<HiraHospitalSrch[]> {
    return this.prisma.hiraHospitalSrch.findMany({
      where: { ykiho },
      orderBy: [{ tp: 'asc' }, { srchCd: 'asc' }],
    });
  }

  findAssessment(ykiho: string): Promise<HiraHospitalAsm | null> {
    return this.prisma.hiraHospitalAsm.findUnique({ where: { ykiho } });
  }

  /** 비급여는 기관당 수백 행일 수 있다 — 화면은 상한을 두고 총건수만 따로 센다. */
  async findNpay(
    ykiho: string,
    limit: number,
  ): Promise<{ rows: HiraHospitalNpay[]; total: number }> {
    const [rows, total] = await Promise.all([
      this.prisma.hiraHospitalNpay.findMany({
        where: { ykiho },
        orderBy: { sno: 'asc' },
        take: limit,
      }),
      this.prisma.hiraHospitalNpay.count({ where: { ykiho } }),
    ]);
    return { rows, total };
  }
}
