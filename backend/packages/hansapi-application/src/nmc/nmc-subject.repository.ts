import { Injectable } from '@nestjs/common';
import { PrismaService, type NmcHospitalSubject } from '@hansapi/data';

/**
 * NMC 병원 진료과목 저장소. nmc_hospital_subject 테이블만 읽는다.
 *
 * DB 접근만 담당한다 — 반환은 Prisma 모델(엔티티) 그대로다. row→DTO 매핑·envelope 조립은
 * 서비스의 몫이라 여기서 하지 않는다.
 */
@Injectable()
export class NmcSubjectRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** 병원 한 곳의 진료과목. 과목코드 순으로 정렬한다. */
  listByHospital(hpid: string): Promise<NmcHospitalSubject[]> {
    return this.prisma.nmcHospitalSubject.findMany({
      where: { hpid },
      orderBy: { subjectCd: 'asc' },
    });
  }
}
