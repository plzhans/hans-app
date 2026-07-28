import type { ConfigSource } from '@hansapp/common';

/** DB 설정 주입 토큰 */
export const DB_CONFIG = Symbol('DB_CONFIG');

/**
 * 데이터 계층이 필요로 하는 설정. 이 계층이 스스로 정의하고 스스로 검증한다.
 *
 * 어떤 키가 필수인지는 이 계층만 안다. @hansapp/common 은 로딩 규칙만 알고,
 * 서버는 서비스키 같은 남의 설정을 몰라도 된다.
 */
export interface DbConfig {
  /** 메인 DB */
  readonly url: string;

  /** 로그 DB. 보존기간·관리 주기가 달라 분리돼 있다. */
  readonly logUrl: string;

  /**
   * prisma migrate 전용 shadow DB.
   * 런타임에는 쓰지 않고 마이그레이션 생성 시에만 필요하므로 선택값이다.
   * 운영 환경에는 없는 게 정상이다(deploy 는 shadow DB 를 쓰지 않는다).
   */
  readonly shadowUrl?: string;
}

/**
 * 설정에서 DB 설정을 뽑아 검증한다. 전부 시크릿이라 .env(DATABASE_URL 등)로 주입되고,
 * 계산된 트리에서 경로(databaseUrl 등)로 읽는다.
 * 필수값이 없으면 여기서 즉시 실패한다. 쿼리를 날리는 순간이 아니라 부팅 시점에 죽어야 한다.
 */
export function buildDbConfig(source: ConfigSource): DbConfig {
  return Object.freeze({
    url: source.getString('database.url'),
    logUrl: source.getString('database.logUrl'),
    shadowUrl: source.getStringOrDefault('database.shadowUrl') || undefined,
  });
}
