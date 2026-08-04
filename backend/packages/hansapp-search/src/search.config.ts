import type { ConfigSource } from '@hansapp/common';

/** 검색(Elasticsearch) 설정 주입 토큰 */
export const SEARCH_CONFIG = Symbol('SEARCH_CONFIG');

/**
 * 검색 계층 설정. 이 계층이 스스로 정의하고 스스로 검증한다.
 *
 * **접속값은 URL 하나로 받는다** — DATABASE_URL 과 같은 방식이다. 자격증명이 있으면 URL 에
 * userinfo 로 박는다(`http://user:pass@host:9200`). username/password 를 따로 두지 않는다.
 *
 * **인덱스 alias 같은 인덱스별 이름은 여기 두지 않는다.** 인덱스가 늘어나면(hospital·pharmacy…)
 * 설정 항목이 인덱스 수만큼 불어나기 때문이다. alias 는 코드 상수(schema/index.ts)로 고정한다.
 */
export interface SearchConfig {
  /** ES 노드 URL. 자격증명은 URL 에 담는다: http://user:pass@127.0.0.1:9200 */
  readonly node: string;

  /**
   * **인덱스 이름 접두사**(예: develop → develop-healthcare_hospital). 한 ES 클러스터를 여러
   * 환경이 공유해도 인덱스가 안 겹치게 하는 유일한 격리 단위다. 접두사 적용은 이름 해석
   * 헬퍼(schema/index.ts) 한 곳에서만 한다.
   *
   * **환경 이름과 분리해 둔다**(ELASTICSEARCH_INDEX_PREFIX). 클러스터를 나눠 쓰는 방식이
   * 환경 구분과 늘 같지는 않기 때문이다 — 같은 develop 이라도 사람마다 다른 접두사로 띄우거나,
   * 새 매핑을 나란히 올려 비교해 보려면 접두사만 따로 돌릴 수 있어야 한다.
   */
  readonly indexPrefix: string;

  /** 대량 색인 배치 크기(keyset 페이지·bulk 묶음). 인덱스와 무관한 전역 값이라 여기 둔다. */
  readonly batchSize: number;

  /**
   * 정본 스키마 JSON 이 있는 디렉터리. **비우면 패키지 동봉본**을 쓴다.
   *
   * 운영에서 **리빌드 없이 스키마만 고쳐 재적용**하려고 둔다 — env.ts 가 config 를 cwd 기준으로
   * 찾는 것과 같은 결이다. 배포 경로의 편집 가능한 자리(예: `<배포>/config/schema`)를 가리키면
   * 그 파일만 고치고 `es schema import` 를 다시 돌리면 된다(코드에 안 박혔으므로).
   */
  readonly schemaDir?: string;
}

/**
 * 설정에서 검색 설정을 뽑아 검증한다.
 * ES 노드가 없으면 부팅 시점에 즉시 실패한다 — 색인을 시도하는 순간이 아니라.
 *
 * 접속 URL(node)은 시크릿이라 .env(ELASTICSEARCH_URL)로 주입되고, schemaDir 은 비밀 아닌
 * 값이라 config/config.<환경>.yaml(elasticsearchSchemaDir) 또는 환경변수로 준다. getX 가 둘을 한
 * 트리에서 경로로 읽는다(ELASTICSEARCH_URL → elasticsearchUrl 등 __/camelCase 규칙).
 *
 * 인덱스 접두사(indexPrefix)도 같은 자리에서 온다(ELASTICSEARCH_INDEX_PREFIX).
 */
export function buildSearchConfig(cfg: ConfigSource): SearchConfig {
  return Object.freeze({
    node: cfg.getUrl('elasticsearch.url'),
    // 인덱스 접두사(ELASTICSEARCH_INDEX_PREFIX). **미설정이면 환경 이름으로 떨어진다** —
    // 예전엔 환경 이름이 곧 접두사였고, 그 시절에 만든 인덱스(develop-…)를 그대로 찾아야 한다.
    indexPrefix: cfg.getStringOrDefault('elasticsearch.indexPrefix') || cfg.env,
    batchSize: cfg.getNumberOrDefault('search.batchSize', 1000),
    schemaDir: cfg.getStringOrDefault('search.schemaDir') || undefined,
  });
}
