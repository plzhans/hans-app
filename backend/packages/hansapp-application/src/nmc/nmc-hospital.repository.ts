import { Injectable } from '@nestjs/common';
import { PrismaService, type NmcHospital } from '@hansapp/data';

/**
 * NMC 병원 원본 미러 저장소. nmc_hospital 테이블만 읽는다.
 *
 * DB 접근만 담당한다 — 반환은 Prisma 모델(엔티티) 그대로다. row→DTO 매핑·envelope 조립은
 * 서비스의 몫이라 여기서 하지 않는다.
 */
@Injectable()
export class NmcHospitalRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** 병원 한 페이지. hpid 순으로 정렬한다. */
  list(page: number, size: number): Promise<NmcHospital[]> {
    return this.prisma.nmcHospital.findMany({
      orderBy: { hpid: 'asc' },
      skip: (page - 1) * size,
      take: size,
    });
  }

  count(): Promise<number> {
    return this.prisma.nmcHospital.count();
  }

  /** hpid 1건 조회. 없으면 null. */
  findByHpid(hpid: string): Promise<NmcHospital | null> {
    return this.prisma.nmcHospital.findUnique({ where: { hpid } });
  }
}
