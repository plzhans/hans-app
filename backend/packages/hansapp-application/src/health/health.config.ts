import type { ConfigSource } from '@hansapp/common';

/** 접속 점검 설정 주입 토큰 */
export const HEALTH_CONFIG = Symbol('HEALTH_CONFIG');

/**
 * 접속 점검이 필요로 하는 설정.
 *
 * DB·ES 는 각 계층이 이미 접속 정보를 들고 있어(PrismaService·ElasticsearchService)
 * 여기서 다시 받지 않는다. Redis 만 캐시가 **지연 연결**이라 점검용 커넥션을 따로
 * 열어야 하고, 그래서 URL 이 필요하다.
 */
export interface HealthConfig {
  /** 캐시용 Redis URL. 비어 있으면 캐시가 인메모리로 도는 구성이라 점검을 건너뛴다. */
  readonly redisUrl?: string;
}

/** 설정에서 접속 점검 설정을 뽑는다. */
export function buildHealthConfig(source: ConfigSource): HealthConfig {
  return Object.freeze({
    redisUrl: source.getUrlOrDefault('redis.url') || undefined,
  });
}
