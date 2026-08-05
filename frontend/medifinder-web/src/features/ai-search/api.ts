import { useMutation } from '@tanstack/react-query';
import { reactFetch } from '@/shared/api/mutator';

/**
 * AI 검색 API.
 *
 * **생성 코드(orval)가 아니라 손으로 쓴 얇은 훅이다.** `/healthcare/ai-search` 가 아직 스펙
 * (docs/openapi/hansapp-openapi.json)에 없어서인데, 스펙 재생성이 로컬 DB·ES 접속을 요구해
 * 이 자리에서 돌릴 수 없었다. **`pnpm api:sync` 가 도는 환경에서 재생성하면 이 파일은 지우고**
 * generated/react/healthcare 의 훅으로 갈아끼우면 된다 — 그래서 mutator 를 그대로 쓴다
 * (인증·언어 헤더가 생성 코드와 똑같이 붙는다).
 */

/** 화면이 배너로 띄우는 신호. 서버 스키마의 enum 과 같은 목록이다. */
export type AiSearchWarning =
  | 'off_topic'
  | 'emergency_suspected'
  | 'medical_caution'
  | 'unsupported_inverse'
  | 'tertiary_referral'
  | 'too_vague';

/**
 * 질문에서 뽑아낸 검색 조건. **검색 결과가 아니다** — 이걸 그대로 `/search` 로 넘겨
 * 기존 검색 화면이 목록을 그린다.
 */
export interface AiSearchFilter {
  subjectCds: string[];
  specialistCds: string[];
  asmItemCds: string[];
  specialtyCds: string[];
  equipmentCds: string[];
  classCds: string[];
  tiers: string[];
  emergency: boolean;
  baby: boolean;
  name?: string;
}

/**
 * 화면이 실행할 일. **닫힌 집합이고 서버가 정한다** — 모델이 이름을 지어내지 않는다.
 * 모르는 이름이 오면 조용히 넘긴다(서버가 앞서 나가도 옛 화면이 안 깨진다).
 */
export type AiSearchTool =
  /** 조건(+지역)으로 목록 조회. 좌표가 필요 없다. */
  | 'search_hospitals'
  /** 현재 위치 기준 거리순. **측위는 화면 몫이다** — 서버는 좌표를 모른다. */
  | 'search_nearby'
  /** 지역을 되물어야 한다. 장소를 말했는데 코드로 못 옮겼다(역 이름·읍면동). */
  | 'ask_location'
  /** 검색하지 않는다. 범위 밖이거나 조건을 하나도 못 잡았다. */
  | 'reject';

/** 툴 인자. 툴마다 쓰는 것만 채워진다. */
export interface AiSearchParams {
  filter: AiSearchFilter;
  /** 시군구 코드(없으면 시도 코드). `search_hospitals` 에서만 채워진다. */
  regionCd?: string;
  /** 사용자가 쓴 지역 표현 원문("강남역"). 화면에 그대로 보여준다. */
  placeText?: string;
  /** `reject` 사유. */
  reason?: AiSearchWarning;
}

export interface AiSearchResponse {
  /** 무엇을 할지. 화면은 이것으로 갈린다. */
  tool: AiSearchTool;
  params: AiSearchParams;
  warnings: AiSearchWarning[];
  /** 조건이 맞게 잡혔는지 사용자가 확인할 한 문장. */
  explain: string;
  /** 검증에서 떨어진 코드. 비어 있는 게 정상이라 화면에는 안 쓴다(디버깅용). */
  dropped: string[];
  provider: string;
  model: string;
  /**
   * 캐시된 답이면 true. 이때 `usage` 는 **처음 물었을 때** 쓴 토큰이라 이 요청의 비용이 아니다.
   */
  cached: boolean;
  /** 서버가 이 요청을 처리한 시간(ms). 브라우저가 기다린 시간이 아니다(네트워크 제외). */
  elapsedMs: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
}

/**
 * 자연어 질문 → 검색 조건. **POST 인 이유**는 질문이 URL 에 남지 않게 하기 위해서다 —
 * 건강 관련 질문이 접근 로그·리퍼러·브라우저 히스토리에 쌓이면 안 된다.
 *
 * 캐싱하지 않는다(useQuery 가 아니라 useMutation) — 같은 질문을 다시 보내는 것이 재시도이지
 * 캐시 히트가 아니고, 요청 하나가 곧 외부 LLM 요금이라 조용히 재요청되면 곤란하다.
 */
export function useAiSearch() {
  return useMutation<AiSearchResponse, Error, string>({
    mutationFn: (q: string) =>
      reactFetch<AiSearchResponse>('/healthcare/ai-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q }),
      }),
  });
}

/**
 * 툴 인자 → 병원 조회 파라미터. **서버 필터 이름과 조회 파라미터 이름이 다르다** —
 * 필터는 코드 배열이라 복수형(subjectCds)이고, 조회는 쉼표로 이은 문자열 하나다.
 * 그 간극을 **여기 한 곳에서만** 메운다 — 미리보기와 검색 화면이 같은 조건을 봐야
 * "3곳 보고 눌렀더니 다른 목록" 이 안 생긴다.
 *
 * 빈 값은 담지 않는다. undefined 면 훅이 그 파라미터를 아예 빼고 보낸다.
 */
export function paramsToQuery(params: AiSearchParams) {
  const { filter } = params;
  const csv = (values: string[]) =>
    values.length > 0 ? values.join(',') : undefined;

  return {
    subject: csv(filter.subjectCds),
    specialist: csv(filter.specialistCds),
    assessment: csv(filter.asmItemCds),
    specialty: csv(filter.specialtyCds),
    equipment: csv(filter.equipmentCds),
    category: csv(filter.classCds),
    tier: csv(filter.tiers),
    emergency: filter.emergency || undefined,
    baby: filter.baby || undefined,
    name: filter.name || undefined,
    region: params.regionCd || undefined,
  };
}

/**
 * 응답 → 검색 화면 쿼리스트링. paramsToQuery 를 URL 로 옮기고 **정렬까지 정한다.**
 *
 * 두 군데 이름이 갈리는 것은 둘뿐이다 — 병원명은 URL 에서 `q`(검색창에 들어가는 값이라),
 * 불리언은 `1`(URL 은 문자열만 싣는다).
 *
 * `search_nearby` 는 `sort=distance` 가 된다. **좌표는 안 싣는다** — 검색 화면이 거리순인데
 * 좌표가 없으면 위치 버튼을 띄우고 쿼리를 멈추는 흐름을 이미 갖고 있어서, 거기에 얹으면
 * 권한 요청·실패 안내를 다시 만들 필요가 없다(좌표를 URL 에 남기지 않는 규칙과도 맞는다).
 *
 * 빈 값은 아예 안 싣는다 — `?subject=&tier=` 같은 빈 파라미터가 붙으면 공유한 링크가
 * 지저분해지고, 검색 화면이 "조건 있음" 으로 오해할 여지도 생긴다.
 */
export function toSearchParams(result: AiSearchResponse): URLSearchParams {
  const { name, emergency, baby, ...codes } = paramsToQuery(result.params);
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(codes)) {
    if (value) params.set(key, value);
  }
  if (emergency) params.set('emergency', '1');
  if (baby) params.set('baby', '1');
  if (name) params.set('q', name);
  if (result.tool === 'search_nearby') params.set('sort', 'distance');

  return params;
}
