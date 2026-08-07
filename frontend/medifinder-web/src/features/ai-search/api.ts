import { useMutation, useQuery } from '@tanstack/react-query';

import {
  aiCapabilitiesControllerCapabilities,
  healthcareAiSearchControllerSearch,
} from '@/shared/api/generated/react/ai/ai';
import type {
  AiSearchHistoryTurnDto,
  AiSearchParamsDto,
  AiSearchRequestDto,
  AiSearchResponseDto,
  AiSearchResponseDtoTool,
  AiSearchResponseDtoWarningsItem,
  CapabilitiesResponseDto,
  ModelChoiceDto,
  QuotaDto,
  QuotaWindowDto,
} from '@/shared/api/generated/model';

/*
  **타입은 생성 코드에서 가져오고, 훅만 여기서 쓴다.**

  타입을 손으로 들고 있던 시절에는 서버가 필드를 바꿔도 화면이 조용히 옛 모양을 믿었다.
  이제 스펙이 바뀌면 `pnpm api:sync` 한 번으로 여기까지 따라온다.

  훅을 그대로 안 쓰는 이유는 orval 설정이 **모든 오퍼레이션을 useQuery 로** 뽑기 때문이다
  (orval.config.ts 의 query.useQuery). 질문은 캐시 대상이 아니라 아래에서 useMutation 으로
  감싼다 — 생성된 fetch 함수만 빌려 쓰므로 URL·헤더·본문 조립은 여전히 생성 코드가 한다.
*/

/** 아래 이름들은 화면이 쓰던 이름 그대로다 — Dto 접미사를 화면까지 끌고 가지 않는다. */
export type AiSearchParams = AiSearchParamsDto;
export type AiSearchTool = AiSearchResponseDtoTool;
export type AiSearchWarning = AiSearchResponseDtoWarningsItem;
export type AiSearchHistoryTurn = AiSearchHistoryTurnDto;
export type AiSearchQuota = QuotaDto;
export type AiSearchQuotaWindow = QuotaWindowDto;
export type AiModelChoice = ModelChoiceDto;
export type AiCapabilities = CapabilitiesResponseDto;
export type AiSearchAsk = AiSearchRequestDto;

/**
 * 서버가 스펙에 싣지 않는 개발용 값. **로컬·개발 응답에만 실린다**(운영은 안 보낸다).
 *
 * 스펙에 없으니 생성 타입에도 없다 — 그게 맞다. 개발 화면에서 토큰 내역을 그리려고
 * 여기서만 얹어 쓴다.
 */
export interface AiSearchDebugInfo {
  cached: boolean;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
}

/**
 * 화면이 받는 응답. **스펙 타입 + 개발용 `debug`** 다 — 있으면 그리고 없으면 만다.
 * 나머지 필드는 전부 생성 타입에서 온다.
 */
export type AiSearchResponse = AiSearchResponseDto & {
  debug?: AiSearchDebugInfo;
};

/**
 * 자연어 질문 → 검색 조건. **POST 인 이유**는 질문이 URL 에 남지 않게 하기 위해서다 —
 * 건강 관련 질문이 접근 로그·리퍼러·브라우저 히스토리에 쌓이면 안 된다.
 *
 * 캐싱하지 않는다(useQuery 가 아니라 useMutation) — 같은 질문을 다시 보내는 것이 재시도이지
 * 캐시 히트가 아니고, 요청 하나가 곧 외부 LLM 호출이라 조용히 재요청되면 곤란하다.
 */
export function useAiSearch() {
  return useMutation<AiSearchResponse, Error, AiSearchAsk>({
    mutationFn: (ask) => healthcareAiSearchControllerSearch(ask),
  });
}

/**
 * 지금 할 수 있는 것(남은 사용량·고를 수 있는 모델). **채팅창을 열 때 한 번만** 부른다.
 *
 * 첫 질문을 하기 전에도 얼마나 남았는지·무엇으로 보내지는지는 보여야 하는데, 답변에
 * 실려 오는 값은 물어봐야 생긴다. 그 빈자리만 메우는 용도다.
 *
 * **다시 부르지 않는다**(staleTime 무한, 포커스·재접속 갱신 끔). 값이 바뀌는 계기는
 * 이 사람이 질문하는 순간뿐이고 그때는 답변이 새 값을 싣고 온다.
 *
 * 실패하면 사용량과 모델이 둘 다 없다 — 질문을 막는 쪽으로 다룬다(호출부 참고).
 */
export function useAiCapabilities() {
  return useQuery<AiCapabilities>({
    queryKey: ['ai', 'capabilities'],
    queryFn: ({ signal }) => aiCapabilitiesControllerCapabilities({ signal }),
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
