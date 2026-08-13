import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EnvLlmModelReadRepository, type EnvLlmModel } from '@hansapp/data';

import { EnvLlmKeyAdminService } from './env-llm-key-admin.service';
import { EnvLlmModelWriteRepository } from './env-llm-model-write.repository';

/** 화면에 내려보내는 한 줄. */
export interface EnvLlmModelView {
  readonly id: number;
  readonly keyId: number;
  readonly name: string;
  readonly enabled: boolean;
  readonly isDefault: boolean;
  /** 목록에서의 자리. 작은 것이 앞이다. */
  readonly sortOrder: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface EnvLlmModelInput {
  keyId?: number;
  name?: string;
  enabled?: boolean;
}

/**
 * 서버가 부를 수 있는 모델 목록.
 *
 * **키가 소유한다.** 같은 이름이라도 어느 접속처로 부르느냐가 다르면 다른 행이다
 * (사무실 ollama 의 llama3 와 다른 기계의 llama3).
 *
 * 업체 목록 조회는 여기 두지 않고 키 서비스가 가진다 — 물어보려면 잠긴 값을 열어야 하고,
 * 그 열쇠(keyring)는 키 서비스가 이미 들고 있다.
 */
@Injectable()
export class EnvLlmModelAdminService {
  constructor(
    private readonly read: EnvLlmModelReadRepository,
    private readonly write: EnvLlmModelWriteRepository,
    private readonly keys: EnvLlmKeyAdminService,
  ) {}

  /** 전부. 화면이 키별로 묶는다. */
  async list(): Promise<EnvLlmModelView[]> {
    const rows = await this.read.findAll();
    return rows.map(toView);
  }

  /**
   * 더한다. **첫 모델은 자동으로 기본이 된다** — 하나뿐인데 기본이 아니면 그 키로는 아무것도
   * 부를 수 없고, 그 사실이 실제 호출이 실패할 때까지 드러나지 않는다.
   */
  async create(input: EnvLlmModelInput, adminId: number | null): Promise<EnvLlmModelView> {
    const keyId = input.keyId;
    if (keyId === undefined) {
      throw new BadRequestException('keyId is required.');
    }
    // 없는 키에 매달리지 않게 먼저 확인한다(FK 위반을 500 으로 흘리지 않는다).
    await this.keys.get(keyId);

    const name = (input.name ?? '').trim();
    if (!name) {
      throw new BadRequestException('name is required.');
    }

    const siblings = await this.write.findByKey(keyId);
    const first = siblings.length === 0;

    return toView(
      await this.guard(() =>
        this.write.create({
          keyId,
          name,
          enabled: input.enabled ?? true,
          isDefault: first,
          // 새 모델은 맨 뒤에 붙는다. 자리는 목록 화면에서 옮긴다.
          sortOrder: Math.max(0, ...siblings.map((m) => m.sortOrder)) + 1,
          updatedBy: adminId,
        }),
      ),
    );
  }

  /**
   * 켜고 끈다. **기본 모델은 못 끈다** — 서버가 부를 수 없는 것을 기본으로 두는 상태가 되고,
   * 그건 다음 질문이 실패할 때까지 조용하다. 먼저 다른 것을 기본으로 옮기게 한다.
   */
  async update(
    id: number,
    input: EnvLlmModelInput,
    adminId: number | null,
  ): Promise<EnvLlmModelView> {
    const current = await this.require(id);
    if (input.enabled === false && current.isDefault) {
      throw new BadRequestException(
        'Cannot disable the default model — set another model as default first.',
      );
    }
    return toView(
      await this.guard(() =>
        this.write.update(id, {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
          updatedBy: adminId,
        }),
      ),
    );
  }

  /**
   * 지운다. **기본으로 지정된 것은 못 지운다** — 지우는 순간 모델을 안 적은 호출이 갈 곳을
   * 잃는다. 그 키의 마지막 하나라면 지울 수 있다(그 키를 안 쓰겠다는 뜻이다).
   */
  async remove(id: number): Promise<void> {
    const row = await this.require(id);
    if (row.isDefault) {
      const siblings = await this.write.findByKey(row.keyId);
      if (siblings.length > 1) {
        throw new BadRequestException(
          'Cannot delete the default model — set another model as default first.',
        );
      }
    }
    await this.write.delete(id);
  }

  /**
   * 목록의 차례를 다시 매긴다. **한 키의 것을 통째로 받는다** — 두 줄만 맞바꾸는 요청은
   * 사이에 다른 변경이 끼면 결과가 갈리는데, 통째로 받으면 화면이 본 그대로가 된다.
   */
  async reorder(
    keyId: number,
    ids: readonly number[],
    adminId: number | null,
  ): Promise<EnvLlmModelView[]> {
    const siblings = await this.write.findByKey(keyId);
    const known = new Set(siblings.map((m) => m.id));
    if (ids.length !== known.size || ids.some((id) => !known.has(id))) {
      throw new BadRequestException('ids must list every model of this key exactly once.');
    }
    await this.write.reorder(ids, adminId);
    const rows = await this.write.findByKey(keyId);
    return rows.map(toView);
  }

  /** 기본으로 삼는다. 같은 키 안에서 하나만 기본이다. */
  async setDefault(id: number, adminId: number | null): Promise<void> {
    const row = await this.require(id);
    await this.write.setDefault(row.keyId, id, adminId);
  }

  private async require(id: number): Promise<EnvLlmModel> {
    const row = await this.write.findOne(id);
    if (!row) throw new NotFoundException(`LLM model ${id} not found.`);
    return row;
  }

  /** 같은 키에 같은 이름이 두 번 들어오면 유니크 인덱스가 막는다 — 그것을 400 으로 옮긴다. */
  private async guard<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        (error as { code?: string }).code === 'P2002'
      ) {
        throw new BadRequestException('That model is already registered for this key.');
      }
      throw error;
    }
  }
}

function toView(row: EnvLlmModel): EnvLlmModelView {
  return {
    id: row.id,
    keyId: row.keyId,
    name: row.name,
    enabled: row.enabled,
    isDefault: row.isDefault,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
