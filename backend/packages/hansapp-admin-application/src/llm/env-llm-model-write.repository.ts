import { Injectable } from '@nestjs/common';
import { PrismaService, type EnvLlmModel, type Prisma } from '@hansapp/data';

/**
 * 서버 LLM 모델 쓰기 — **관리자 계층에만 있다.**
 * 읽기(EnvLlmModelReadRepository)는 @hansapp/data 에 있어 호출 계층도 쓴다.
 */
@Injectable()
export class EnvLlmModelWriteRepository {
  constructor(private readonly prisma: PrismaService) {}

  findOne(id: number): Promise<EnvLlmModel | null> {
    return this.prisma.envLlmModel.findUnique({ where: { id } });
  }

  findByKey(keyId: number): Promise<EnvLlmModel[]> {
    return this.prisma.envLlmModel.findMany({
      where: { keyId },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  }

  /**
   * 받은 차례대로 자리를 다시 매긴다. **한 트랜잭션이다** — 중간에 끊기면 두 행이 같은
   * 자리를 갖고, 그 뒤로는 목록 순서가 조회할 때마다 달라진다.
   */
  async reorder(
    ids: readonly number[],
    updatedBy: number | null,
  ): Promise<void> {
    await this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.envLlmModel.update({
          where: { id },
          data: { sortOrder: index + 1, updatedBy },
        }),
      ),
    );
  }

  create(data: Prisma.EnvLlmModelUncheckedCreateInput): Promise<EnvLlmModel> {
    return this.prisma.envLlmModel.create({ data });
  }

  update(
    id: number,
    data: Prisma.EnvLlmModelUncheckedUpdateInput,
  ): Promise<EnvLlmModel> {
    return this.prisma.envLlmModel.update({ where: { id }, data });
  }

  delete(id: number): Promise<void> {
    return this.prisma.envLlmModel
      .deleteMany({ where: { id } })
      .then(() => undefined);
  }

  /**
   * 한 키 안에서 하나만 기본으로 만든다. **한 트랜잭션이다** — 둘로 나누면 그 사이에
   * 기본이 없거나 둘인 순간이 생기고, 그때 들어온 호출이 어디로 갈지 정해지지 않는다.
   *
   * 기본은 **꺼져 있으면 안 된다.** 끈 모델을 기본으로 두면 서버가 부를 수 없는 것을
   * 기본으로 삼게 되므로 여기서 같이 켠다.
   */
  async setDefault(
    keyId: number,
    id: number,
    updatedBy: number | null,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.envLlmModel.updateMany({
        where: { keyId, isDefault: true },
        data: { isDefault: false },
      }),
      this.prisma.envLlmModel.update({
        where: { id },
        data: { isDefault: true, enabled: true, updatedBy },
      }),
    ]);
  }
}
