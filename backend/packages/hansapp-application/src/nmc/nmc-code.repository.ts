import { Injectable } from '@nestjs/common';
import { PrismaService, type NmcCode } from '@hansapp/data';

/**
 * NMC 코드마스터 저장소. nmc_code 테이블만 읽는다.
 *
 * DB 접근만 담당한다 — 반환은 Prisma 모델(엔티티) 그대로다. row→DTO 매핑·envelope 조립은
 * 서비스의 몫이라 여기서 하지 않는다.
 */
@Injectable()
export class NmcCodeRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** 코드 한 페이지. cmMid 가 있으면 대분류로 좁힌다. 대분류→소분류 순으로 정렬한다. */
  list(cmMid: string | undefined, page: number, size: number): Promise<NmcCode[]> {
    const where = cmMid === undefined ? {} : { cmMid: cmMid };

    return this.prisma.nmcCode.findMany({
      where,
      orderBy: [{ cmMid: 'asc' }, { cmSid: 'asc' }],
      skip: (page - 1) * size,
      take: size,
    });
  }

  count(cmMid: string | undefined): Promise<number> {
    const where = cmMid === undefined ? {} : { cmMid: cmMid };

    return this.prisma.nmcCode.count({ where });
  }
}
