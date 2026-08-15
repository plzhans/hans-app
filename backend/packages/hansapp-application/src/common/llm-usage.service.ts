import { Injectable, Logger } from '@nestjs/common';
import { PrismaLogService } from '@hansapp/data';

/** 적재할 호출 한 건. **질문 원문도 프롬프트 전문도 받지 않는다**(모델 주석 참고). */
export interface LlmUsageInput {
  requestId?: string;
  appId?: number;
  userId?: number;
  /** 어떤 일에 쓴 호출인가. 지금은 `hospital-search` 하나뿐이다. */
  feature: string;
  promptName: string;
  promptHash: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  cached: boolean;
  elapsedMs: number;
  upstreamId?: string;
}

/**
 * LLM 호출 이력 기록. **이력이지 사용량 집계가 아니다** — 사용량·정산은 별도로 기록한다.
 *
 * 적재 실패는 삼킨다 — 기록이 안 됐다고 사용자의 검색을 실패시킬 이유가 없다(인증
 * 이벤트 로그와 같은 태도다). 대신 경고로 남겨 조용히 비어 가는 일은 없게 한다.
 *
 * **부르는 쪽이 await 하지 않아도 된다.** 응답을 만든 뒤에 남기는 기록이라 사용자를
 * 기다리게 할 이유가 없다 — 다만 프로세스가 그 사이에 죽으면 한 건이 빈다.
 * 한 건이 비어도 되는 표라 그렇게 둔다 — 여기서 무엇을 합산하지 않기 때문이다.
 */
@Injectable()
export class LlmUsageService {
  private readonly logger = new Logger(LlmUsageService.name);

  constructor(private readonly prisma: PrismaLogService) {}

  async record(input: LlmUsageInput): Promise<void> {
    try {
      await this.prisma.llmUsage.create({
        data: {
          requestId: input.requestId ?? null,
          appId: input.appId ?? null,
          userId: input.userId ?? null,
          feature: input.feature,
          promptName: input.promptName,
          promptHash: input.promptHash,
          provider: input.provider,
          model: input.model,
          inputTokens: input.inputTokens,
          outputTokens: input.outputTokens,
          cacheReadTokens: input.cacheReadTokens ?? 0,
          cacheWriteTokens: input.cacheWriteTokens ?? 0,
          cached: input.cached,
          elapsedMs: input.elapsedMs,
          upstreamId: input.upstreamId ?? null,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to store LLM usage (${input.feature}/${input.promptName}): ${String(error)}`,
      );
    }
  }
}
