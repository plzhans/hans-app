import { Injectable } from '@nestjs/common';
import { PrismaService, type HiraCode } from '@hansapi/data';

import type { HiraCodeType } from './hira-code.types';

/**
 * HIRA 코드 저장소. hira_code(tp/cd/cd_nm/cd_cmt 로 통일 저장한 코드 테이블)만 읽는다.
 *
 * DB 접근만 담당한다 — 반환은 Prisma 모델(엔티티) 그대로다. 원본 API 필드명으로 되돌리는
 * 매핑·envelope 조립은 서비스의 몫이라 여기서 하지 않는다.
 */
@Injectable()
export class HiraCodeRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** 코드 한 페이지. tp 로 종류를 갈라 cd 오름차순으로 정렬한다. */
  list(tp: HiraCodeType, page: number, size: number): Promise<HiraCode[]> {
    return this.prisma.hiraCode.findMany({
      where: { tp },
      orderBy: { cd: 'asc' },
      skip: (page - 1) * size,
      take: size,
    });
  }

  count(tp: HiraCodeType): Promise<number> {
    return this.prisma.hiraCode.count({ where: { tp } });
  }
}
