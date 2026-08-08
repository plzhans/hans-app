import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  open,
  seal,
  suffixOf,
  SETTING_KEYRING,
  type SecretBoxKeys,
} from '@hansapp/common';
import { fetchVendorModels } from '@hansapp/llm';
import {
  EnvLlmKeyReadRepository,
  EnvLlmKeyStatus,
  LlmKeyType,
  LlmProvider,
  type EnvLlmKey,
} from '@hansapp/data';

import { EnvLlmKeyWriteRepository } from './env-llm-key-write.repository';

/**
 * 화면에 내려보내는 한 줄. **잠긴 값의 원문은 절대 나가지 않는다** — 뒤 4자만 간다.
 */
export interface EnvLlmKeyView {
  readonly id: number;
  readonly provider: LlmProvider;
  /** LOCAL 만 갖는다. 호스팅 업체는 빈 문자열(업체가 곧 신원). */
  readonly name: string;
  readonly keyType: LlmKeyType;
  readonly hasSecret: boolean;
  readonly secretSuffix: string | null;
  readonly baseUrl: string | null;
  readonly defaultModel: string | null;
  readonly allowedModels: string | null;
  readonly isDefault: boolean;
  readonly status: EnvLlmKeyStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** 만들거나 고칠 때 받는 값. 잠긴 값은 **평문으로 오고 여기서 잠근다.** */
export interface EnvLlmKeyInput {
  provider?: LlmProvider;
  name?: string;
  keyType?: LlmKeyType;
  /** `null` 은 지운다, `undefined` 는 건드리지 않는다. */
  secret?: string | null;
  baseUrl?: string | null;
  defaultModel?: string | null;
  allowedModels?: string | null;
  status?: EnvLlmKeyStatus;
}

/** 업체 기본 주소. 행의 baseUrl 이 비면 이걸로 물어본다. */
const BASE_URL: Partial<Record<LlmProvider, string>> = {
  [LlmProvider.ANTHROPIC]: 'https://api.anthropic.com',
  [LlmProvider.OPENAI]: 'https://api.openai.com',
};

/** DB enum → SDK 어댑터 이름. */
const ADAPTER: Record<string, 'anthropic' | 'openai' | 'local'> = {
  ANTHROPIC: 'anthropic',
  OPENAI: 'openai',
  LOCAL: 'local',
};

/** 우리 SDK 어댑터가 있는 업체. GOOGLE 은 enum 에 있지만 아직 못 부른다. */
const CALLABLE: LlmProvider[] = [
  LlmProvider.ANTHROPIC,
  LlmProvider.OPENAI,
  LlmProvider.LOCAL,
];

/**
 * 여러 대를 붙일 수 있는 업체. **이름으로 구별한다.**
 *
 * 나머지는 계정이 하나라 하나씩만 등록되고(DB 의 @@unique([provider, name]) 가 막는다),
 * 그때는 업체가 곧 신원이라 이름을 두지 않는다(빈 문자열).
 */
const MULTI: LlmProvider[] = [LlmProvider.LOCAL];

@Injectable()
export class EnvLlmKeyAdminService {
  constructor(
    private readonly read: EnvLlmKeyReadRepository,
    private readonly write: EnvLlmKeyWriteRepository,
    @Inject(SETTING_KEYRING)
    private readonly keyring: SecretBoxKeys | undefined,
  ) {}

  async list(): Promise<EnvLlmKeyView[]> {
    return (await this.read.findAll()).map((row) => toView(row));
  }

  async get(id: number): Promise<EnvLlmKeyView> {
    return toView(await this.require(id));
  }

  async create(
    input: EnvLlmKeyInput,
    adminId: number | null,
  ): Promise<EnvLlmKeyView> {
    const provider = input.provider;
    if (!provider || !CALLABLE.includes(provider)) {
      throw new BadRequestException(
        `provider must be one of ${CALLABLE.join(', ')}.`,
      );
    }
    const keyType = input.keyType ?? LlmKeyType.API_KEY;
    this.assertKeyType(provider, keyType);
    const name = resolveName(provider, input.name);
    const baseUrl = trimOrNull(input.baseUrl);
    assertBaseUrl(provider, baseUrl);

    const secret = this.lock(input.secret);
    return toView(
      await this.guard(() =>
        this.write.create({
          provider,
          name,
          keyType,
          secretEncrypted: secret.encrypted ?? null,
          secretSuffix: secret.suffix ?? null,
          baseUrl,
          defaultModel: trimOrNull(input.defaultModel),
          allowedModels: trimOrNull(input.allowedModels),
          status: input.status ?? EnvLlmKeyStatus.ACTIVE,
          updatedBy: adminId,
        }),
      ),
    );
  }

  /**
   * 고친다. **요청에 없는 필드는 건드리지 않는다** — 화면이 마스킹된 값을 되돌려 보내
   * 실수로 지우는 일이 없게 한다(설정 저장과 같은 규칙).
   */
  async update(
    id: number,
    input: EnvLlmKeyInput,
    adminId: number | null,
  ): Promise<EnvLlmKeyView> {
    const current = await this.require(id);
    const provider = input.provider ?? current.provider;
    if (!CALLABLE.includes(provider)) {
      throw new BadRequestException(
        `provider must be one of ${CALLABLE.join(', ')}.`,
      );
    }
    const keyType = input.keyType ?? current.keyType;
    this.assertKeyType(provider, keyType);
    /*
      업체가 바뀌면 이름의 의미도 바뀐다 — LOCAL 에서 ANTHROPIC 으로 옮기면 이름이 쓸모가
      없어지고, 반대로 오면 이름이 있어야 한다. 그래서 이름은 늘 다시 판정한다.
    */
    const name = resolveName(
      provider,
      input.name !== undefined ? input.name : current.name,
    );
    const baseUrl =
      input.baseUrl === undefined ? current.baseUrl : trimOrNull(input.baseUrl);
    assertBaseUrl(provider, baseUrl);

    const secret =
      input.secret === undefined ? undefined : this.lock(input.secret);

    return toView(
      await this.guard(() =>
        this.write.update(id, {
          provider,
          name,
          keyType,
          ...(secret
            ? {
                secretEncrypted: secret.encrypted ?? null,
                secretSuffix: secret.suffix ?? null,
              }
            : {}),
          baseUrl,
          ...(input.defaultModel !== undefined
            ? { defaultModel: trimOrNull(input.defaultModel) }
            : {}),
          ...(input.allowedModels !== undefined
            ? { allowedModels: trimOrNull(input.allowedModels) }
            : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          updatedBy: adminId,
        }),
      ),
    );
  }

  /**
   * 지운다. **기본으로 지정된 것은 못 지운다** — 지우는 순간 호출이 갈 곳을 잃는데,
   * 그 사실이 다음 질문이 실패할 때까지 드러나지 않는다. 먼저 다른 것을 기본으로 옮기게 한다.
   */
  async remove(id: number): Promise<void> {
    const row = await this.require(id);
    if (row.isDefault) {
      throw new BadRequestException(
        'Cannot delete the default key. Set another one as default first.',
      );
    }
    await this.write.delete(id);
  }

  async setDefault(id: number, adminId: number | null): Promise<void> {
    const row = await this.require(id);
    // 꺼 둔 것을 기본으로 만들면 호출이 곧장 막힌다. 켠 뒤에 지정하게 한다.
    if (row.status !== EnvLlmKeyStatus.ACTIVE) {
      throw new BadRequestException(
        'Enable the key before making it the default.',
      );
    }
    await this.write.setDefault(id, adminId);
  }

  /**
   * 업체에 실제로 있는 모델 목록.
   *
   * **저장 전에도 부를 수 있다.** 등록 화면에서 키를 막 입력한 상태로도 확인할 수 있어야
   * 하므로, `id` 를 주면 저장된 키를 열어 쓰고 안 주면 받은 초안으로 부른다.
   *
   * **실패를 삼키지 않는다.** 키가 틀렸는지 서버가 꺼졌는지 화면이 알아야 하고, 그때도
   * 사람이 모델 이름을 직접 적을 수 있으니 이 실패가 등록을 막지는 않는다.
   */
  async listVendorModels(input: {
    id?: number;
    provider?: LlmProvider;
    keyType?: LlmKeyType;
    secret?: string | null;
    baseUrl?: string | null;
  }): Promise<string[]> {
    const row = input.id === undefined ? null : await this.require(input.id);
    const provider = input.provider ?? row?.provider;
    if (!provider || !CALLABLE.includes(provider)) {
      throw new BadRequestException(
        `provider must be one of ${CALLABLE.join(', ')}.`,
      );
    }
    /*
      화면이 새 키를 보냈으면 그것으로, 안 보냈으면 저장된 것을 연다 — 마스킹된 값을
      되돌려 보내는 경우에도 실제 키로 물어보게 된다.
    */
    const secret = input.secret?.trim()
      ? input.secret.trim()
      : this.reveal(row?.secretEncrypted ?? null);
    const baseUrl =
      (input.baseUrl ?? row?.baseUrl ?? '').trim() || BASE_URL[provider] || '';
    if (!baseUrl) {
      throw new BadRequestException('baseUrl is required.');
    }

    try {
      return await fetchVendorModels({
        provider: ADAPTER[provider],
        keyType:
          (input.keyType ?? row?.keyType) === LlmKeyType.AUTH_TOKEN
            ? 'authToken'
            : 'apiKey',
        secret,
        baseUrl,
        allowedModels: [],
      });
    } catch (error) {
      throw new BadRequestException(
        `업체에 모델 목록을 물어보지 못했습니다: ${String(
          error instanceof Error ? error.message : error,
        )}`,
      );
    }
  }

  /** 저장된 잠긴 값을 연다. 키가 없거나 값이 깨졌으면 없는 것으로 본다. */
  private reveal(raw: string | null): string | undefined {
    if (!raw || !this.keyring) return undefined;
    try {
      return open(raw, this.keyring);
    } catch {
      return undefined;
    }
  }

  private async require(id: number): Promise<EnvLlmKey> {
    const row = await this.write.findOne(id);
    if (!row) throw new NotFoundException(`Unknown LLM key: ${id}`);
    return row;
  }

  /**
   * **AUTH_TOKEN 은 ANTHROPIC 전용이다.** 개인 구독 토큰이라 다른 업체에는 대응물이 없고,
   * 있다 해도 헤더가 다르다.
   */
  private assertKeyType(provider: LlmProvider, keyType: LlmKeyType): void {
    if (
      keyType === LlmKeyType.AUTH_TOKEN &&
      provider !== LlmProvider.ANTHROPIC
    ) {
      throw new BadRequestException('AUTH_TOKEN is only for ANTHROPIC.');
    }
  }

  /**
   * 잠근다. **뒤 4자를 따로 남긴다** — 목록 한 번 그리자고 전 행을 복호화하지 않으려는 것이다
   * (app_llm_key 와 같은 수법).
   */
  private lock(raw: string | null | undefined): {
    encrypted?: string;
    suffix?: string;
  } {
    const value = raw?.trim();
    if (!value) return {};
    if (!this.keyring) {
      // 평문으로 저장하는 우회는 두지 않는다. 저장 자체를 거절한다.
      throw new BadRequestException(
        'appSecretEncryption 키가 없어 저장할 수 없습니다.',
      );
    }
    return { encrypted: seal(value, this.keyring), suffix: suffixOf(value) };
  }

  /**
   * DB 의 유니크 위반을 사람 말로 바꾼다.
   *
   * **"하나만" 규칙은 DB 가 판정한다**(@@unique([provider, name])). 서비스가 먼저 세어 보는
   * 방법도 있지만 그건 조회와 삽입 사이에 틈이 있고, 무엇보다 규칙이 두 곳에 적히게 된다.
   */
  private async guard<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        (error as { code?: string }).code === 'P2002'
      ) {
        throw new BadRequestException(
          'Already registered. Hosted providers allow only one key; use a different name for local endpoints.',
        );
      }
      throw error;
    }
  }
}

function toView(row: EnvLlmKey): EnvLlmKeyView {
  return {
    id: row.id,
    provider: row.provider,
    name: row.name,
    keyType: row.keyType,
    hasSecret: !!row.secretEncrypted,
    secretSuffix: row.secretSuffix,
    baseUrl: row.baseUrl,
    defaultModel: row.defaultModel,
    allowedModels: row.allowedModels,
    isDefault: row.isDefault,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * 이름을 정한다.
 *
 * **여러 대를 붙일 수 있는 업체만 이름을 갖는다.** 호스팅 업체는 하나뿐이라 업체가 곧
 * 신원이고, 빈 문자열이 DB 유니크와 짝이 되어 두 번째 행을 막는다.
 */
function resolveName(
  provider: LlmProvider,
  raw: string | null | undefined,
): string {
  if (!MULTI.includes(provider)) return '';
  const name = (raw ?? '').trim();
  if (!name) {
    throw new BadRequestException('name is required for LOCAL.');
  }
  return name;
}

/** LOCAL 은 baseUrl 이 신원이다 — 기본 주소를 대신 넣으면 엉뚱한 기계로 나간다. */
function assertBaseUrl(provider: LlmProvider, baseUrl: string | null): void {
  if (provider === LlmProvider.LOCAL && !baseUrl) {
    throw new BadRequestException('baseUrl is required for LOCAL.');
  }
}

function trimOrNull(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  return value ? value : null;
}
