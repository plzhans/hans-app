import { Injectable } from '@nestjs/common';
import type { EnvSetting } from '../generated/main';
import { PrismaService } from './prisma.service';

/**
 * 서비스 설정 저장소 — **읽기 전용이다.**
 *
 * 이 클래스는 설정을 읽는 모든 계층이 공유한다(메일·외부 연동·관리자). 그래서 여기에
 * 쓰기를 두면 **읽기만 하면 되는 계층이 실수로 설정을 덮을 수 있는 자리**가 생긴다.
 * 쓰기는 관리자 계층이 제 손으로 만든다(SettingWriteRepository).
 *
 * 값은 암호화된 상태 그대로 오간다 — 여는 것은 부르는 쪽 서비스가 한다.
 */
@Injectable()
export class SettingReadRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 전부 읽는다. **키 단위로 조회하지 않는다** — 설정은 수십 개뿐이고, 하나 읽자고
   * DB 를 때리면 캐시를 둔 의미가 없다. 한 번에 받아 통째로 캐시한다.
   */
  findAll(): Promise<EnvSetting[]> {
    return this.prisma.envSetting.findMany();
  }
}
