import { Injectable } from '@nestjs/common';
import { PrismaService, type EnvLlmKey, type Prisma } from '@hansapp/data';

/**
 * 서버 LLM 키 쓰기 — **관리자 계층에만 있다.**
 *
 * 읽기(EnvLlmKeyReadRepository)는 @hansapp/data 에 있어 호출 계층도 쓰지만, 쓰기는 여기
 * 둔다. SettingWriteRepository 와 같은 이유다 — 같이 두면 읽기만 하면 되는 자리에서 키를
 * 덮을 수 있다.
 */
@Injectable()
export class EnvLlmKeyWriteRepository {
  constructor(private readonly prisma: PrismaService) {}

  findOne(id: number): Promise<EnvLlmKey | null> {
    return this.prisma.envLlmKey.findUnique({ where: { id } });
  }

  create(data: Prisma.EnvLlmKeyUncheckedCreateInput): Promise<EnvLlmKey> {
    return this.prisma.envLlmKey.create({ data });
  }

  update(id: number, data: Prisma.EnvLlmKeyUncheckedUpdateInput): Promise<EnvLlmKey> {
    return this.prisma.envLlmKey.update({ where: { id }, data });
  }

  delete(id: number): Promise<void> {
    return this.prisma.envLlmKey.deleteMany({ where: { id } }).then(() => undefined);
  }

  /**
   * 하나만 기본으로 만든다. **한 트랜잭션이다** — 둘로 나누면 그 사이에 기본이 없거나
   * 둘인 순간이 생기고, 그때 들어온 호출이 엉뚱한 곳으로 나간다.
   */
  async setDefault(id: number, updatedBy: number | null): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.envLlmKey.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      }),
      this.prisma.envLlmKey.update({
        where: { id },
        data: { isDefault: true, updatedBy },
      }),
    ]);
  }
}
