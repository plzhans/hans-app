import { Injectable } from '@nestjs/common';
import type { EnvLlmModel } from '../generated/main';
import { PrismaService } from './prisma.service';

/**
 * 서버 LLM 모델 저장소 — **읽기 전용이다.**
 *
 * EnvLlmKeyReadRepository 와 같은 이유로 여기 있다. 읽는 쪽이 여럿이고(호출 계층·관리 화면)
 * 계층마다 갈릴 조회 조건이 없다. 쓰기는 관리자 계층이 제 손으로 만든다.
 */
@Injectable()
export class EnvLlmModelReadRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 전부 읽는다. **행이 몇 개뿐이라 키 단위로 조회하지 않는다** — 부르는 쪽이 캐시를 들고
   * 자기 키의 것만 골라 쓴다(EnvLlmKeyReadRepository.findAll 과 같은 방침).
   *
   * **정렬은 여기서 끝낸다.** 화면에 내려보내는 차례가 곧 이 순서라, 읽는 쪽마다 다시
   * 정렬하면 어디선가 한 번 빠뜨렸을 때 그 화면만 조용히 다른 순서가 된다.
   */
  findAll(): Promise<EnvLlmModel[]> {
    return this.prisma.envLlmModel.findMany({
      orderBy: [{ keyId: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
    });
  }
}
