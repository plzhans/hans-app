/**
 * Redis 캐시 키 접두사(namespace)를 한곳에서 관리한다.
 *
 * 충돌은 '접두사'가 겹칠 때 난다 — 여러 서비스가 같은 Redis 를 공유하기 때문이다.
 * 그래서 관리 대상은 이 접두사 값들뿐이고, 뒤에 붙는 식별자(id·lang 등)는 호출부가 붙인다.
 * 새 캐시를 붙일 때 여기에 접두사 하나만 추가하면, 어떤 namespace 가 이미 쓰였는지 한눈에 보인다.
 *
 * 규칙: `<도메인>:<대상>` 콜론 구분. 호출부는 `${CachePrefix.x}:${id}:${lang}` 처럼 이어 붙인다.
 */
export const CachePrefix = {
  /**
   * 병원 도메인. 실제 키는 서비스가 `hospital:{<id>}:base` · `hospital:{<id>}:i18n:<lang>` 로 조립한다.
   * {id} 를 해시태그 {}로 감싸는 건 Redis Cluster 에서 base·i18n 을 같은 슬롯에 묶어 mget/mdel 을
   * 가능하게 하기 위함이다(단일 노드에선 무해).
   */
  hospital: 'hospital',
} as const;
