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
}

/**
 * 서비스 프롬프트 저장소. 지금은 **파일**에서 읽는다(`data/healthcare/svc-prompts/`).
 *
 * **저장소로 이름 붙인 것은 DB 로 옮길 자리이기 때문이다.** 프롬프트는 코드가 아니라
 * 운영이 고치는 값이라, 결국 배포 없이 바꿀 수 있어야 한다. 그때 이 클래스의 내부만
 * 바뀌고 부르는 쪽(HealthcareAiSearchService)은 그대로 둔다.
 *
 * 파일은 이름 하나에 둘이다:
 *   `<name>.system.md`     시스템 프롬프트(코드표·규칙)
 *   `<name>.schema.json`   출력 JSON Schema({name, description, schema})
 *
 * **읽은 것은 메모리에 붙들어 둔다.** 매 요청 디스크를 치지 않으려는 것이고, 코드표가
 * 정적 참조 데이터인 것과 같은 이유다(HealthcareCodeCache 참고). 고쳤으면 재부팅하거나
 * reload() 한다.
 *
 * **부팅 때 읽지 않는다.** AI 검색은 부가 기능이라 프롬프트 파일이 없다고 서버가 못 뜨면
 * 안 된다 — 그 엔드포인트만 실패하는 게 맞다(LLM 설정을 검증하지 않는 것과 같은 태도).
 */
@Injectable()
export class SvcPromptRepository {
  private readonly logger = new Logger(SvcPromptRepository.name);
  private readonly cache = new Map<string, SvcPrompt>();
  private readonly dir: string;

  constructor(@Inject(LLM_CONFIG) config: LlmConfig) {
    // 설정의 상대경로를 cwd·워크스페이스 루트 순으로 푼다(인증서·ES 스키마와 같은 규칙).
    // 개발에선 어느 하위 폴더에서 띄워도 backend/data 를 집고, 배포에선 cwd 기준이 된다.
    this.dir = resolveConfigPath(__dirname, config.promptDir);
  }

  /** 캐시를 비운다. 파일을 고친 뒤 재부팅 없이 반영할 때. */
  reload(): void {
    this.cache.clear();
    this.logger.log('svc prompt cache cleared');
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
      // 경로를 메시지에 넣는다 — 이 오류의 원인은 대개 "배포에 data/ 가 안 올라갔다" 이고,
      // 그때 알아야 하는 것은 어느 자리를 봤느냐다.
      throw new Error(
        `prompt "${name}" not found under ${this.dir}: ${String(cause)}`,
      );
    }

    const parsed = JSON.parse(schemaRaw) as {
      name?: string;
      schema?: Record<string, unknown>;
    };
    if (!parsed.schema) {
      throw new Error(
        `prompt schema "${name}" has no "schema" field (${schemaPath})`,
      );
    }

    this.logger.log(`loaded svc prompt: ${name} (${this.dir})`);
    return {
      name,
      system,
      schema: { name: parsed.name ?? name, schema: parsed.schema },
    };
  }
}
