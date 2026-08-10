import { apiFetch } from '@/shared/api/client';
import type { PageResponse } from '@/shared/api/users';

/**
 * LLM 호출 한 건.
 *
 * **질문 원문도 프롬프트 전문도 없다** — 서버가 애초에 담지 않는다(해시만 있다).
 * 그래서 화면이 모든 칸을 그대로 펼쳐 보여도 새어 나갈 것이 없다.
 */
export interface LlmUsageLog {
  /** BigInt 라 서버가 문자열로 준다. */
  id: string;
  /** 추적 id(X-Request-Id). 애플리케이션 로그와 이어 보는 값. */
  requestId?: string | null;
  appId?: number | null;
  userId?: number | null;
  feature: string;
  promptName: string;
  /** 프롬프트의 판. 프롬프트를 고치면 값이 갈린다. */
  promptHash: string;
  /** 정규화한 질문의 해시. 원문은 복원할 수 없다. */
  questionHash: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** 우리 Redis 캐시에서 나온 답인가. true 면 토큰이 전부 0 이다. */
  cached: boolean;
  elapsedMs: number;
  upstreamId?: string | null;
  createdAt: string;
}

export interface LlmUsageLogParams {
  page: number;
  size: number;
  /** ISO 8601. requestId 가 없으면 서버가 이 값을 요구한다. */
  from?: string;
  to?: string;
  requestId?: string;
  feature?: string;
  cached?: boolean;
  appId?: number;
  userId?: number;
}

/**
 * LLM 호출 이력. 최근 순.
 *
 * **기간이 사실상 필수다.** 이 표의 인덱스는 시각이 앞자리라 기간이 빠지면 통째로 훑는다 —
 * 서버가 `from` 도 `requestId` 도 없으면 400 으로 거절한다.
 */
export function listLlmUsageLogs(params: LlmUsageLogParams) {
  const query = new URLSearchParams({
    page: String(params.page),
    size: String(params.size),
  });
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  if (params.requestId) query.set('requestId', params.requestId);
  if (params.feature) query.set('feature', params.feature);
  if (params.cached !== undefined) query.set('cached', String(params.cached));
  if (params.appId !== undefined) query.set('appId', String(params.appId));
  if (params.userId !== undefined) query.set('userId', String(params.userId));

  return apiFetch<PageResponse<LlmUsageLog>>(
    `/api/logs/llm?${query.toString()}`,
  );
}
