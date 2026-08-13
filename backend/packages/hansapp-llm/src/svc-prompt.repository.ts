import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { resolveConfigPath } from '@hansapp/common';

import { LLM_CONFIG, type LlmConfig } from './llm.config';
import type { LlmJsonSchema } from './llm.types';

/** 프롬프트 한 벌. 시스템 프롬프트와 출력 스키마는 짝이라 따로 읽지 않는다. */
export interface SvcPrompt {
  readonly name: string;
  readonly system: string;
  readonly schema: LlmJsonSchema;
  /**
   * 이 프롬프트의 신원(sha256 앞 16자). **응답을 캐시하는 쪽이 키에 섞으라고 둔 값이다** —
   * 프롬프트를 고쳤는데 옛 규칙으로 만든 답이 계속 나오면, 고친 사람이 왜 안 바뀌는지 모른다.
   *
   * 읽을 때 한 번만 계산한다. 8천 토큰짜리 문서를 요청마다 해싱할 이유가 없다.
   */
  readonly hash: string;
}

/**
 * 서비스 프롬프트 저장소. 지금은 파일에서 읽는다(`data/healthcare/svc-prompts/`).
 * **저장소로 이름 붙인 것은 DB 로 옮길 자리이기 때문**이다 — 그때 부르는 쪽은 안 바뀐다.
 *
 * 파일은 이름 하나에 둘이다:
 *   `<name>.system.md`     시스템 프롬프트(코드표·규칙)
 *   `<name>.schema.json`   출력 JSON Schema({name, description, schema})
 *
 * 읽은 것은 메모리에 붙들어 둔다. 고쳤으면 재부팅하거나 reload().
 *
 * **부팅 때 읽지 않는다** — 파일이 없다고 서버가 못 뜨면 안 되고, 그 엔드포인트만
 * 실패하는 게 맞다(LLM 설정을 검증하지 않는 것과 같은 태도).
 */
@Injectable()
export class SvcPromptRepository {
  private readonly logger = new Logger(SvcPromptRepository.name);
  private readonly cache = new Map<string, SvcPrompt>();
  private readonly blocks = new Map<string, { text: string; hash: string }>();
  private readonly dir: string;

  constructor(@Inject(LLM_CONFIG) config: LlmConfig) {
    // 상대경로는 cwd·워크스페이스 루트 순으로 푼다(인증서·ES 스키마와 같은 규칙).
    this.dir = resolveConfigPath(__dirname, config.promptDir);
  }

  /** 캐시를 비운다. 파일을 고친 뒤 재부팅 없이 반영할 때. */
  reload(): void {
    this.cache.clear();
    this.blocks.clear();
    this.logger.log('svc prompt cache cleared');
  }

  /**
   * 시스템 프롬프트 조각 하나만 읽는다(`<name>.system.md`). 스키마가 없는 덧붙임 블록용이다.
   *
   * **해시를 같이 준다.** 이 블록이 답을 바꾸므로, 캐시 키에 섞지 않으면 블록을 붙인 결과와
   * 안 붙인 결과가 같은 칸을 쓰게 된다.
   */
  getBlock(name: string): { text: string; hash: string } {
    const cached = this.blocks.get(name);
    if (cached) {
      return cached;
    }
    const path = join(this.dir, `${name}.system.md`);
    let text: string;
    try {
      text = readFileSync(path, 'utf8');
    } catch (cause) {
      throw new Error(`prompt block "${name}" not found: ${String(cause)}`);
    }
    const loaded = {
      text,
      hash: createHash('sha256').update(text).digest('hex').slice(0, 16),
    };
    this.blocks.set(name, loaded);
    this.logger.log(`loaded svc prompt block: ${name} #${loaded.hash}`);
    return loaded;
  }

  get(name: string): SvcPrompt {
    const cached = this.cache.get(name);
    if (cached) {
      return cached;
    }
    const loaded = this.read(name);
    this.cache.set(name, loaded);
    return loaded;
  }

  private read(name: string): SvcPrompt {
    const systemPath = join(this.dir, `${name}.system.md`);
    const schemaPath = join(this.dir, `${name}.schema.json`);

    let system: string;
    let schemaRaw: string;
    try {
      system = readFileSync(systemPath, 'utf8');
      schemaRaw = readFileSync(schemaPath, 'utf8');
    } catch (cause) {
      // 원인이 대개 "배포에 data/ 가 안 올라갔다" 라 어느 자리를 봤는지가 중요하다.
      throw new Error(`prompt "${name}" not found under ${this.dir}: ${String(cause)}`);
    }

    const parsed = JSON.parse(schemaRaw) as {
      name?: string;
      schema?: Record<string, unknown>;
    };
    if (!parsed.schema) {
      throw new Error(`prompt schema "${name}" has no "schema" field (${schemaPath})`);
    }

    // 스키마까지 넣어 해싱한다 — 출력 필드가 바뀌어도 응답 모양이 달라지므로,
    // 시스템 프롬프트만 보면 스키마만 고친 변경이 캐시를 안 지나간다.
    const hash = createHash('sha256').update(system).update(schemaRaw).digest('hex').slice(0, 16);

    this.logger.log(`loaded svc prompt: ${name} #${hash} (${this.dir})`);
    return {
      name,
      system,
      schema: { name: parsed.name ?? name, schema: parsed.schema },
      hash,
    };
  }
}
