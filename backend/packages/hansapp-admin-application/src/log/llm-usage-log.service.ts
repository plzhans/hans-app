import { BadRequestException, Injectable } from '@nestjs/common';
import { Page } from '@hansapp/common';

import { LlmUsageLogRepository } from './llm-usage-log.repository';
import type { LlmUsageLogFilter } from './llm-usage-log.repository';

/**
 * LLM 호출 한 건.
 *
 * **표의 모든 칸을 그대로 내보낸다.** 이 화면은 합산이 아니라 추적이 목적이라,
 * "무엇을 보여줄지" 를 서버가 고르면 정작 필요한 값이 빠진다. 원문이 담기는 칸이
 * 애초에 없어서(질문도 프롬프트도 해시만 있다) 가릴 것도 없다.
 *
 * id 는 문자열이다 — DB 는 BigInt 인데 JSON 에는 그 타입이 없다.
 */
export interface LlmUsageLogEntry {
  readonly id: string;
  readonly requestId: string | null;
  readonly appId: number | null;
  readonly userId: number | null;
  readonly feature: string;
  readonly promptName: string;
  readonly promptHash: string;
  readonly questionHash: string;
  readonly provider: string;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly cached: boolean;
  readonly elapsedMs: number;
  readonly upstreamId: string | null;
  readonly createdAt: Date;
}

export interface LlmUsageLogQuery extends LlmUsageLogFilter {
  readonly page: number;
  readonly size: number;
}

/**
 * LLM 호출 이력 조회.
 *
 * **합산하지 않는다.** 사용량·정산은 별도 표가 맡고, 이 표는 말 그대로 이력이다 —
 * "이 호출 하나에 무슨 일이 있었나" 에만 답한다. 여기서 SUM 을 돌리기 시작하면
 * 정산의 정본이 둘이 되고, 캐시 히트(토큰 0)나 유실된 한 건 때문에 두 값이 어긋난다.
 */
@Injectable()
export class LlmUsageLogService {
  constructor(private readonly repo: LlmUsageLogRepository) {}

  async list(query: LlmUsageLogQuery): Promise<Page<LlmUsageLogEntry>> {
    /*
      **기간을 강제한다.** 인덱스의 앞자리가 created_at 이라, 기간이 없으면 어떤 조건을
      붙여도 표를 통째로 훑는다(저장소 주석 참고). request_id 는 단독 인덱스가 있어
      유일한 예외다 — 애플리케이션 로그에서 id 만 들고 넘어오는 길을 막으면 안 된다.
    */
    if (!query.from && !query.requestId) {
      throw new BadRequestException(
        'Either a start time (from) or a requestId is required.',
      );
    }

    const [rows, total] = await this.repo.listPage(
      {
        from: query.from,
        to: query.to,
        requestId: query.requestId,
        feature: query.feature,
        cached: query.cached,
        appId: query.appId,
        userId: query.userId,
      },
      (query.page - 1) * query.size,
      query.size,
    );

    return new Page(
      rows.map((row) => ({
        id: row.id.toString(),
        requestId: row.requestId,
        appId: row.appId,
        userId: row.userId,
        feature: row.feature,
        promptName: row.promptName,
        promptHash: row.promptHash,
        questionHash: row.questionHash,
        provider: row.provider,
        model: row.model,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        cacheReadTokens: row.cacheReadTokens,
        cacheWriteTokens: row.cacheWriteTokens,
        cached: row.cached,
        elapsedMs: row.elapsedMs,
        upstreamId: row.upstreamId,
        createdAt: row.createdAt,
      })),
      query.page,
      query.size,
      total,
    );
  }
}
