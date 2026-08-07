import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { seal, suffixOf } from '@hansapp/common';
import { AppRole, LlmKeyVerifyState, LlmProvider, Prisma } from '@hansapp/data';

import { AppService } from './app.service';
import { APP_SECRET_CONFIG, type AppSecretConfig } from './app-secret.config';
import { LlmKeyRepository, type LlmKeyView } from './llm-key.repository';

/**
 * 여러 개를 붙일 수 있는 provider.
 *
 * **LOCAL 만 예외인 이유는 청구서다.** 호스팅 업체는 "지금 어느 키로 나갔나" 가 업체 청구서와
 * 맞춰 볼 값이라 답이 하나여야 하고, 사용자가 업체 콘솔에서 키를 여러 개 파도 우리 쪽에서
 * 고를 이유가 없다. LOCAL 은 청구서가 없고 기계마다 다른 모델을 띄우는 것이 정상 사용이라,
 * "여러 대 중 하나를 고른다" 가 자연스럽다.
 */
const MULTI_KEY_PROVIDERS: ReadonlySet<LlmProvider> = new Set([
  LlmProvider.LOCAL,
]);

/** 이름 최대 길이. 스키마의 VarChar(50) 과 맞춘다. */
const NAME_MAX_LENGTH = 50;

/** 이름에 허용하는 글자. 화면·URL·로그에서 그대로 읽히도록 좁게 잡는다. */
const NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

/** 등록/수정 입력. 주지 않은 항목은 건드리지 않는다(부분 수정). */
export interface UpsertLlmKeyInput {
  readonly provider: LlmProvider;
  /** LOCAL 만 의미가 있다. 호스팅 업체는 무시하고 빈 문자열로 고정한다. */
  readonly name?: string;
  /** 업체 키 원문. LOCAL 은 생략할 수 있다. */
  readonly secret?: string;
  readonly baseUrl?: string;
  readonly defaultModel?: string;
  readonly monthlyLimitMicroUsd?: number | null;
  readonly dailyLimitMicroUsd?: number | null;
  readonly fallbackToService?: boolean;
  readonly enabled?: boolean;
}

/**
 * 앱이 자기 이름으로 쓸 LLM 업체 키(BYOK) 관리.
 *
 * **등록할 때 업체에 물어보지 않는다.** 업체마다 확인 방법이 다르고, 사내망 Ollama 는 우리
 * 서버에서 닿지도 않으며, 200 이 와도 잔액까지는 알 수 없어 "확인됨" 이 지킬 수 없는 약속이
 * 된다. 그래서 등록은 늘 UNVERIFIED 로 앉히고, **첫 실사용의 결과**가 판정을 적는다
 * ([`LlmKeyRepository.markVerified`](./llm-key.repository.ts)).
 */
@Injectable()
export class LlmKeyService {
  private readonly logger = new Logger(LlmKeyService.name);

  constructor(
    private readonly keys: LlmKeyRepository,
    private readonly apps: AppService,
    @Inject(APP_SECRET_CONFIG) private readonly config: AppSecretConfig,
  ) {}

  /** 앱의 업체 키 목록. 잠긴 값은 애초에 읽지 않는다. */
  async list(userId: number, appId: number): Promise<LlmKeyView[]> {
    await this.apps.assertMember(userId, appId);
    return this.keys.listByApp(appId);
  }

  /**
   * 등록. 호스팅 업체는 앱당 하나뿐이라 이미 있으면 409 대신 **덮어쓰기**로 받는다 —
   * 사용자가 하는 일이 "키 교체" 인데 지우고 다시 넣으라고 하면 상한·모델 설정이 함께 날아간다.
   */
  async create(
    userId: number,
    appId: number,
    input: UpsertLlmKeyInput,
  ): Promise<LlmKeyView> {
    await this.apps.assertMember(userId, appId, AppRole.ADMIN);

    const name = this.normalizeName(input.provider, input.name);
    const baseUrl = this.normalizeBaseUrl(input.provider, input.baseUrl);

    if (!input.secret && input.provider !== LlmProvider.LOCAL) {
      throw new BadRequestException('API key is required for this provider.');
    }

    const existing = await this.keys.listByApp(appId);
    const duplicate = existing.find(
      (key) => key.provider === input.provider && key.name === name,
    );
    if (duplicate) {
      // 호스팅 업체는 name 이 늘 '' 이라 여기로 온다 = 교체. LOCAL 은 이름이 겹칠 때만 온다.
      if (!MULTI_KEY_PROVIDERS.has(input.provider)) {
        return this.update(userId, appId, duplicate.id, input);
      }
      throw new BadRequestException(
        'A key with this name already exists for this provider.',
      );
    }

    const data: Prisma.AppLlmKeyUncheckedCreateInput = {
      appId,
      provider: input.provider,
      name,
      baseUrl,
      defaultModel: input.defaultModel?.trim() || null,
      monthlyLimitMicroUsd: this.normalizeLimit(input.monthlyLimitMicroUsd),
      dailyLimitMicroUsd: this.normalizeLimit(input.dailyLimitMicroUsd),
      fallbackToService: input.fallbackToService ?? false,
      enabled: input.enabled ?? true,
      // 판정은 첫 실사용이 한다. 등록은 늘 여기서 시작한다.
      verifyState: LlmKeyVerifyState.UNVERIFIED,
      ...this.sealSecret(input.secret),
    };

    return this.keys.create(data);
  }

  /**
   * 수정. **secret 을 주지 않으면 잠긴 값은 그대로 둔다** — 상한만 고치려고 키를 다시
   * 입력하게 만들면, 사용자가 업체 콘솔에서 키를 새로 파거나 어딘가에 적어 두게 된다.
   */
  async update(
    userId: number,
    appId: number,
    id: number,
    input: Partial<UpsertLlmKeyInput>,
  ): Promise<LlmKeyView> {
    await this.apps.assertMember(userId, appId, AppRole.ADMIN);

    const current = await this.keys.findById(appId, id);
    if (!current) {
      throw new NotFoundException('LLM key not found.');
    }

    const data: Prisma.AppLlmKeyUncheckedUpdateInput = {};

    if (input.name !== undefined) {
      data.name = this.normalizeName(current.provider, input.name);
    }
    if (input.baseUrl !== undefined) {
      data.baseUrl = this.normalizeBaseUrl(current.provider, input.baseUrl);
    }
    if (input.defaultModel !== undefined) {
      data.defaultModel = input.defaultModel.trim() || null;
    }
    if (input.monthlyLimitMicroUsd !== undefined) {
      data.monthlyLimitMicroUsd = this.normalizeLimit(
        input.monthlyLimitMicroUsd,
      );
    }
    if (input.dailyLimitMicroUsd !== undefined) {
      data.dailyLimitMicroUsd = this.normalizeLimit(input.dailyLimitMicroUsd);
    }
    if (input.fallbackToService !== undefined) {
      data.fallbackToService = input.fallbackToService;
    }
    if (input.enabled !== undefined) {
      data.enabled = input.enabled;
    }

    if (input.secret) {
      Object.assign(data, this.sealSecret(input.secret));
      // 키가 바뀌었으면 이전 판정은 더 이상 이 키에 대한 것이 아니다.
      data.verifyState = LlmKeyVerifyState.UNVERIFIED;
      data.verifyError = null;
      data.verifiedAt = null;
    }

    return this.keys.update(id, data);
  }

  async remove(userId: number, appId: number, id: number): Promise<void> {
    await this.apps.assertMember(userId, appId, AppRole.ADMIN);

    const current = await this.keys.findById(appId, id);
    if (!current) {
      throw new NotFoundException('LLM key not found.');
    }
    await this.keys.delete(id);
  }

  /**
   * 원문을 잠근다. 마스터 키가 없으면 **저장을 거절한다** —
   * 잠그지 못한 값을 그냥 넣으면 DB 한 번 새는 것으로 남의 업체 계정이 통째로 털린다.
   */
  private sealSecret(secret?: string): {
    secretEncrypted: string | null;
    secretSuffix: string | null;
  } {
    const plain = secret?.trim();
    if (!plain) return { secretEncrypted: null, secretSuffix: null };

    const keyring = this.config.keyring;
    if (!keyring) {
      this.logger.error(
        'appSecretEncryption is not configured; refusing to store a provider key.',
      );
      throw new NotImplementedException(
        'Provider key storage is not configured on this server.',
      );
    }

    return {
      secretEncrypted: seal(plain, keyring),
      secretSuffix: suffixOf(plain),
    };
  }

  /**
   * provider 안에서의 신원을 정한다.
   *
   * 호스팅 업체는 **사용자가 뭘 보내든 빈 문자열로 고정한다.** 이름을 받아 주면 같은 업체 키를
   * 이름만 달리해 여러 개 넣을 수 있게 되어, 유니크 인덱스가 막으려던 것이 그대로 뚫린다.
   */
  private normalizeName(provider: LlmProvider, name?: string): string {
    if (!MULTI_KEY_PROVIDERS.has(provider)) return '';

    const trimmed = name?.trim() ?? '';
    if (!trimmed) {
      throw new BadRequestException('Name is required for this provider.');
    }
    if (trimmed.length > NAME_MAX_LENGTH) {
      throw new BadRequestException(
        `Name must be at most ${NAME_MAX_LENGTH} characters.`,
      );
    }
    if (!NAME_PATTERN.test(trimmed)) {
      throw new BadRequestException(
        'Name may contain letters, digits, dot, dash and underscore, and must start with a letter or digit.',
      );
    }
    return trimmed;
  }

  /**
   * 엔드포인트를 다듬는다. **LOCAL 은 필수다** — 어느 기계의 Ollama 인지가 이 값으로만 갈린다.
   * 호스팅 업체는 비워 두는 것이 보통이라(서버 설정을 쓴다) 빈 값을 null 로 접는다.
   */
  private normalizeBaseUrl(
    provider: LlmProvider,
    baseUrl?: string,
  ): string | null {
    const trimmed = baseUrl?.trim() ?? '';
    if (!trimmed) {
      if (provider === LlmProvider.LOCAL) {
        throw new BadRequestException(
          'Base URL is required for this provider.',
        );
      }
      return null;
    }

    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new BadRequestException(
        'Base URL must be an absolute http(s) URL.',
      );
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new BadRequestException(
        'Base URL must be an absolute http(s) URL.',
      );
    }
    return trimmed;
  }

  /** 상한. null 은 무제한이고, 0 이하는 "0원까지만" 과 구분되지 않으므로 거절한다. */
  private normalizeLimit(value?: number | null): number | null {
    if (value === undefined || value === null) return null;
    if (!Number.isInteger(value) || value <= 0) {
      throw new BadRequestException(
        'Spending limits must be a positive integer in micro USD, or null for unlimited.',
      );
    }
    return value;
  }
}
