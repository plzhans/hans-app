import { Injectable } from '@nestjs/common';
import {
  PrismaService,
  type NmcBabyHospital,
  type NmcHospital,
  type NmcHospitalSubject,
} from '@hansapp/data';

/** NMC 병원 미러 상세. 한 기관ID(hpid)에 딸린 미러 표 전부를 모은다. */
@Injectable()
export class NmcMirrorDetailRepository {
  constructor(private readonly prisma: PrismaService) {}

  findHospital(hpid: string): Promise<NmcHospital | null> {
    return this.prisma.nmcHospital.findUnique({ where: { hpid } });
  }

  findSubjects(hpid: string): Promise<NmcHospitalSubject[]> {
    return this.prisma.nmcHospitalSubject.findMany({
      where: { hpid },
      orderBy: { subjectCd: 'asc' },
    });
  }

  findBaby(hpid: string): Promise<NmcBabyHospital | null> {
    return this.prisma.nmcBabyHospital.findUnique({ where: { hpid } });
  }
}
