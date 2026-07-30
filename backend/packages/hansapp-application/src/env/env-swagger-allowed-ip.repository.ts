import { Injectable } from '@nestjs/common';
import { PrismaService, EnvSwaggerAllowedIp } from '@hansapp/data';

/**
 * Swagger 접근 허용 IP 목록 저장소.
 *
 * 목록은 사람이 손으로 관리하는 수십 건 규모라 전량을 읽어 호출측(SwaggerAccessService)이
 * 메모리에 올린다. 요청마다 조회하지 않는다 — /docs 는 정적 자산까지 합쳐 한 번 열 때
 * 수십 요청이 몰리는데, 그때마다 DB 를 때릴 값이 아니다.
 */
@Injectable()
export class EnvSwaggerAllowedIpRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** 켜져 있는 항목만. 꺼진 행은 이력으로 남기고 판정에서 뺀다. */
  findEnabled(): Promise<EnvSwaggerAllowedIp[]> {
    return this.prisma.envSwaggerAllowedIp.findMany({
      where: { enabled: true },
      orderBy: { id: 'asc' },
    });
  }
}
