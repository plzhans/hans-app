import { Injectable } from '@nestjs/common';
import { PrismaService, type HiraHospitalSubject } from '@hansapp/data';

/**
 * HIRA 병원 진료과목 저장소. hira_hospital_subject(기관별 진료과목)만 읽는다.
 *
 * DB 접근만 담당한다 — 반환은 Prisma 모델(엔티티) 그대로다. row→item 매핑·envelope 조립은
 * 서비스의 몫이라 여기서 하지 않는다.
 */
@Injectable()
export class HiraSubjectRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** 한 기관의 진료과목 전체. 진료과목 코드 오름차순으로 정렬한다. */
  listByHospital(ykiho: string): Promise<HiraHospitalSubject[]> {
    return this.prisma.hiraHospitalSubject.findMany({
      where: { ykiho },
      orderBy: { dgsbjtCd: 'asc' },
    });
  }
}
