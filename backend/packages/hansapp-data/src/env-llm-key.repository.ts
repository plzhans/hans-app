import { Injectable } from '@nestjs/common';
import type { EnvLlmKey } from '../generated/main';
import { PrismaService } from './prisma.service';

/**
 * 서버 LLM 키 저장소 — **읽기 전용이다.**
 *
 * SettingReadRepository 와 같은 이유로 여기 있다. 읽는 쪽이 여럿이고(호출 계층·관리 화면)
 * 계층마다 갈릴 조회 조건이 없다. 쓰기를 같이 두면 읽기만 하면 되는 계층에서 키를 덮을 수
 * 있어, 쓰기는 관리자 계층이 제 손으로 만든다.
 */
@Injectable()
export class EnvLlmKeyReadRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 전부 읽는다. **행이 몇 개뿐이라 키 단위로 조회하지 않는다** — 부르는 쪽이 캐시를 들고
   * 기본 키를 골라 쓴다.
   */
  findAll(): Promise<EnvLlmKey[]> {
    return this.prisma.envLlmKey.findMany({ orderBy: { id: 'asc' } });
  }
}
