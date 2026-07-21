import { Injectable } from '@nestjs/common';
import { PrismaService, type NmcBabyHospital } from '@hansapi/data';

/**
 * NMC 달빛어린이병원·소아전문센터 저장소. nmc_baby_hospital 테이블만 읽는다.
 *
 * DB 접근만 담당한다 — 반환은 Prisma 모델(엔티티) 그대로다. row→DTO 매핑·envelope 조립은
 * 서비스의 몫이라 여기서 하지 않는다.
 */
@Injectable()
export class NmcBabyRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** 달빛어린이병원 한 페이지. hpid 순으로 정렬한다. */
  list(page: number, size: number): Promise<NmcBabyHospital[]> {
    return this.prisma.nmcBabyHospital.findMany({
      orderBy: { hpid: 'asc' },
      skip: (page - 1) * size,
      take: size,
    });
  }

  count(): Promise<number> {
    return this.prisma.nmcBabyHospital.count();
  }
}
