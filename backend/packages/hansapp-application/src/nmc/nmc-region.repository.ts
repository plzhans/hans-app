import { Injectable } from '@nestjs/common';
import { PrismaService, type NmcRegion } from '@hansapp/data';

/**
 * NMC 지역 저장소. nmc_region(병원 데이터에서 집계한 지역 목록) 테이블만 읽는다.
 *
 * DB 접근만 담당한다 — 반환은 Prisma 모델(엔티티) 그대로다. row→DTO 매핑·envelope 조립은
 * 서비스의 몫이라 여기서 하지 않는다.
 */
@Injectable()
export class NmcRegionRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** 지역 한 페이지. 시도→시군구 순으로 정렬한다. */
  list(page: number, size: number): Promise<NmcRegion[]> {
    return this.prisma.nmcRegion.findMany({
      orderBy: [{ sidoNm: 'asc' }, { sgguNm: 'asc' }],
      skip: (page - 1) * size,
      take: size,
    });
  }

  count(): Promise<number> {
    return this.prisma.nmcRegion.count();
  }
}
