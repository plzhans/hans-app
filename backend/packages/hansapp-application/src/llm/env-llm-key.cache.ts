import { Inject, Injectable, Logger } from '@nestjs/common';
import { open, SETTING_KEYRING, type SecretBoxKeys } from '@hansapp/common';
import {
  EnvLlmKeyReadRepository,
  EnvLlmKeyStatus,
  LlmKeyType,
  type EnvLlmKey,
} from '@hansapp/data';
import type { LlmEndpointSettings } from '@hansapp/llm';

/**
 * 캐시 수명. **5분.** SettingCache 와 같은 이유다 — 화면에서 바꾼 값이 재배포 없이 먹어야 하고,
 * 반대로 호출마다 DB 를 때릴 이유도 없다.
 */
const CACHE_TTL_MS = 5 * 60_000;

/** 업체 기본 주소. 행의 baseUrl 이 비면 이걸 쓴다 — LOCAL 은 기본값이 뜻이 없어 그대로 둔다. */
const BASE_URL: Record<string, string> = {
  ANTHROPIC: 'https://api.anthropic.com',
  OPENAI: 'https://api.openai.com',
  // ollama 기본 포트. vLLM·LM Studio 도 같은 경로를 낸다.
  LOCAL: 'http://127.0.0.1:11434',
};

/** DB enum → SDK 어댑터 이름. */
const PROVIDER: Record<string, 'anthropic' | 'openai' | 'local'> = {
  ANTHROPIC: 'anthropic',
  OPENAI: 'openai',
  LOCAL: 'local',
};

/**
 * 기본 LLM 키를 골라 준다. **원본은 DB(env_llm_key)다.**
 *
 * SettingCache 와 같은 결이다 — 이 클래스는 사본을 TTL 동안 들고 있을 뿐이고, 잠긴 값은
 * 여기서 연다.
 *
 * **GOOGLE 은 아직 못 쓴다.** enum 에는 있지만(app_llm_key 가 쓴다) 우리 쪽 SDK 어댑터가
 * 없다 — 그 행은 없는 것으로 본다. 붙이는 날 PROVIDER 표에 한 줄 더하면 된다.
 */
@Injectable()
export class EnvLlmKeyCache {
  private readonly logger = new Logger(EnvLlmKeyCache.name);

  private value: LlmEndpointSettings | null | undefined;
  private expiresAt = 0;
  /** 진행 중인 갱신. 동시 호출이 DB 를 N번 때리지 않게 묶는다. */
  private refreshing: Promise<void> | undefined;

  constructor(
    private readonly repository: EnvLlmKeyReadRepository,
    @Inject(SETTING_KEYRING)
    private readonly keyring: SecretBoxKeys | undefined,
  ) {}

  /** 지정 없는 호출이 쓸 키. 없으면 null — 부르는 쪽이 막는다. */
  async resolve(): Promise<{ endpoint: LlmEndpointSettings | null }> {
    if (this.value === undefined || Date.now() >= this.expiresAt) {
      await (this.refreshing ??= this.refresh().finally(() => {
        this.refreshing = undefined;
      }));
    }
    return { endpoint: this.value ?? null };
  }

  /** 저장 직후 캐시를 버린다. 방금 바꾼 값이 5분간 안 먹으면 화면이 거짓말을 한다. */
  invalidate(): void {
    this.expiresAt = 0;
  }

  private async refresh(): Promise<void> {
    try {
      const rows = await this.repository.findAll();
      const usable = rows.filter(
        (r) => r.status === EnvLlmKeyStatus.ACTIVE && PROVIDER[r.provider],
      );
      /*
        **기본으로 지정된 것을 쓰고, 없으면 첫 번째다.** 아무것도 지정 안 한 채로 하나만
        등록한 흔한 상태에서 "왜 안 되지" 가 되지 않게 한다.
      */
      const row = usable.find((r) => r.isDefault) ?? usable[0];
      this.value = row ? this.toSettings(row) : null;
      this.expiresAt = Date.now() + CACHE_TTL_MS;
    } catch (error) {
      // 직전 값을 그대로 쓴다. DB 가 순간 흔들릴 때마다 AI 가 멎는 편이 더 나쁘다.
      this.logger.error(
        `LLM 키를 읽지 못했다. 직전 값을 유지한다: ${String(error)}`,
      );
      this.expiresAt = Date.now() + 10_000;
    }
  }

  private toSettings(row: EnvLlmKey): LlmEndpointSettings {
    return {
      provider: PROVIDER[row.provider],
      keyType: row.keyType === LlmKeyType.AUTH_TOKEN ? 'authToken' : 'apiKey',
      secret: this.reveal(row.secretEncrypted, `#${row.id}`),
      baseUrl: row.baseUrl || BASE_URL[row.provider] || '',
      defaultModel: row.defaultModel ?? undefined,
      allowedModels: (row.allowedModels ?? '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean),
    };
  }

  /** 잠긴 값을 연다. 키가 없으면 없는 값으로 본다 — 암호문을 그대로 키로 쓰면 401 만 난다. */
  private reveal(raw: string | null, where: string): string | undefined {
    if (!raw) return undefined;
    if (!this.keyring) {
      this.logger.error(
        `${where}: appSecretEncryption 키가 없어 복호화하지 못했다.`,
      );
      return undefined;
    }
    return open(raw, this.keyring);
  }
}
