import { useMutation, useQuery } from '@tanstack/react-query';
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
  /** 건강 질문. 지금은 답하지 않지만 **나중에 답할 수 있는 것**이라 따로 다룬다. */
  | 'medical_question'
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
  /** 건강 질문에 답한다. `params.answer` 에 본문이 있다(답변 모드에서만). */
  | 'answer_medical'
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
  /** `answer_medical` 의 본문. */
  answer?: string;
}

/** 통 하나의 상태. **어느 통인지는 담긴 필드 이름이 말한다.** */
export interface AiSearchQuotaWindow {
  /** 지금까지 쓴 통합 토큰. */
  used: number;
  limit: number;
}

/**
 * 지금 쓰는 몫. **둘 다 온다 — 화면이 골라 쓴다.**
 *
 * 실제로 깎이는 것은 신원의 것 하나다(로그인했으면 `user`, 아니면 `app`).
 * 그래도 둘 다 오는 것은, 안 깎는 쪽도 얼마나 남았는지는 알아야 해서다.
 *
 * **없는 쪽은 안 걸렸다는 뜻이다.** 지금은 로그인이 없어 `user` 가 늘 비어 있다.
 */
export interface AiSearchQuota {
  /** 앱 예산. 월이 진짜 한도이고 일은 그게 첫날에 다 타지 않게 하는 둑이다. */
  app?: {
    daily?: AiSearchQuotaWindow;
    monthly?: AiSearchQuotaWindow;
  };
  /** 개인 충전 잔액. 리셋되지 않는다. */
  user?: {
    balance?: AiSearchQuotaWindow;
  };
}

/** 잡힌 조건 한 묶음. **코드가 아니라 이름으로 온다**(서버가 코드표를 보고 붙인다). */
export interface AiSearchCondition {
  group:
    | 'subject'
    | 'specialist'
    | 'assessment'
    | 'specialty'
    | 'equipment'
    | 'class';
  /** 사람이 읽는 이름들. 요청 언어(Accept-Language)로 온다. */
  names: string[];
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
  /**
   * 잡힌 조건을 **이름으로** 푼 것. `params.filter` 의 코드와 같은 내용이다.
   * 등급·응급실 같은 고정값은 여기 없다 — 코드표가 없는 값이라 화면이 자기 문구를 쓴다.
   */
  conditions: AiSearchCondition[];
  provider: string;
  /**
   * `params.answer` 의 서명. **답이 있을 때만 온다.**
   * 다음 요청의 `history[].signature` 로 그대로 돌려줘야 답이 문맥으로 이어진다.
   */
  answerSignature?: string;
  /** 실제로 답한 모델. 공개값이다 — 곱할 수량(토큰 수)이 안 나가서 요금이 역산되지 않는다. */
  model: string;
  /**
   * 이 요청이 쓴 **통합 토큰**. 사용자에게 보이는 유일한 사용량 숫자다.
   *
   * 원시 토큰 수가 아니라 환산값이다 — 출력이 입력보다 비싸고 모델마다 단가가 달라서,
   * 단위를 하나로 접지 않으면 같은 숫자가 자리마다 다른 돈을 뜻한다. `quota` 와 같은
   * 단위라 그대로 견줄 수 있다.
   *
   * **캐시된 답도 같은 값이다** — 같은 질문이면 언제 묻든 같은 값이어야 한다.
   * 0 인 경우는 아무 답도 못 받은 때뿐이다(사전 차단).
   */
  credits: number;
  /** 서버가 이 요청을 처리한 시간(ms). 브라우저가 기다린 시간이 아니다(네트워크 제외). */
  elapsedMs: number;
  /** 쓴 몫. **못 셌으면 없다** — 없으면 화면은 아무것도 안 그린다. */
  quota?: AiSearchQuota;
  /**
   * 원시 토큰 내역. **로컬·개발에서만 온다**(서버 설정으로 끊는다).
   *
   * 모델 이름과 달리 이쪽은 곱할 수량이라 운영에서는 응답에 아예 없다. 화면은 있으면
   * 보여주고 없으면 그 칸을 통째로 빼면 된다 — 없는 게 정상이다.
   */
  debug?: {
    /**
     * 우리 Redis 캐시에서 나온 답인가. true 면 아래 `usage` 는 처음 물었을 때 쓴 양이다.
     * **`credits` 는 히트든 아니든 같다** — 값은 우리 원가가 아니라 질문 하나의 값이다.
     */
    cached: boolean;
    usage: {
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens?: number;
      cacheWriteTokens?: number;
    };
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
  return useMutation<AiSearchResponse, Error, AiSearchAsk>({
    mutationFn: ({ q, context, history }: AiSearchAsk) =>
      reactFetch<AiSearchResponse>('/healthcare/ai-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q, context, history }),
      }),
  });
}

/**
 * 한 번의 물음. `context` 는 **직전 응답의 `params` 를 그대로** 넣는다.
 *
 * 서버는 대화를 기억하지 않으므로 이어 가려면 화면이 상태를 들고 다녀야 한다. 받은 것을
 * 그대로 돌려주면 되고, 새 주제를 시작하려면 빼고 보내면 된다.
 */
export interface AiSearchAsk {
  q: string;
  context?: AiSearchParams;
  history?: AiSearchHistoryTurn[];
}

/**
 * 앞서 오간 말 한 마디. **`context` 와 주인이 다르다** — 그쪽은 서버가 발급한 상태고
 * 이쪽은 화면이 들고 있는 대화 원문이다.
 *
 * 조건만으로는 "아까 말한 증상", "그럼 약은?" 처럼 앞을 가리키는 말을 못 푼다.
 * 서버는 최근 3마디만 쓰고 길이도 자른다.
 */
export interface AiSearchHistoryTurn {
  question: string;
  answer?: string;
  /**
   * `answer` 에 딸린 서명(응답의 `answerSignature`). **답을 보낼 거면 반드시 같이 보낸다** —
   * 없거나 안 맞으면 서버가 그 턴의 `answer` 만 버린다(질문은 그대로 쓴다).
   */
  signature?: string;
}

/**
 * 지금 사용량. **채팅창을 열 때 한 번만** 부른다.
 *
 * 첫 질문을 하기 전에도 얼마나 남았는지는 보여야 하는데, 답변에 실려 오는 `quota` 는
 * 물어봐야 생긴다. 그 빈자리만 메우는 용도다.
 *
 * **다시 부르지 않는다**(staleTime 무한, 포커스·재접속 갱신 끔). 값이 바뀌는 계기는
 * 이 사람이 질문하는 순간뿐이고 그때는 답변이 새 값을 싣고 온다 — 폴링하면 안 바뀐 값을
 * 계속 받으면서 Redis 만 친다.
 *
 * 실패해도 조용하다. 사용량 표시가 없을 뿐이라 채팅은 그대로 된다.
 */
export function useAiSearchQuota() {
  return useQuery<{ quota?: AiSearchQuota }>({
    queryKey: ['ai', 'quota'],
    // **`/healthcare` 아래가 아니다** — 재는 대상은 병원이 아니라 부른 사람이다.
    queryFn: () => reactFetch('/ai/quota'),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
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
