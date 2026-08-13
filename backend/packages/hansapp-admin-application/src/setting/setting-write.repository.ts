import { Injectable } from '@nestjs/common';
import { PrismaService, type EnvSetting } from '@hansapp/data';

/**
 * 서비스 설정 쓰기 — **관리자 계층에만 있다.**
 *
 * 읽기(SettingReadRepository)는 @hansapp/data 에 있어 모든 계층이 공유하지만, 쓰기는
 * 여기 둔다. 같이 두면 메일이든 외부 연동이든 설정을 읽기만 하면 되는 자리에서 upsert 가
 * 손에 닿는다 — 실수 한 번이 운영 설정을 덮는다.
 *
 * **읽기를 상속하지 않는다.** 상속하면 이 클래스 하나로 읽기까지 되어 "쓰기는 관리자만" 이라는
 * 선이 도로 흐려진다. 필요한 두 메서드만 갖는다.
 */
@Injectable()
export class SettingWriteRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 넣거나 덮는다. 키가 기본키라 upsert 한 번이면 된다.
   *
   * `encrypted` 는 **이 행을 어떻게 저장했는지의 기록**이다. 값이 비밀인지 아닌지는
   * 카탈로그가 정하고, 저장한 쪽이 그 결과를 여기 남긴다 — 읽을 때 카탈로그를 다시
   * 보고 판단하면, 분류를 바꾸는 순간 기존 행을 잘못 읽는다.
   */
  upsert(
    key: string,
    value: string,
    encrypted: boolean,
    updatedBy: number | null,
  ): Promise<EnvSetting> {
    return this.prisma.envSetting.upsert({
      where: { key },
      create: { key, value, encrypted, updatedBy },
      update: { value, encrypted, updatedBy },
    });
  }

  /**
   * 지운다. **값을 빈 문자열로 덮지 않고 행을 없앤다** — 그래야 "설정 안 함" 과
   * "빈 값으로 설정함" 이 갈린다. 행이 없으면 설정 파일 값으로 폴백한다.
   */
  delete(key: string): Promise<void> {
    return this.prisma.envSetting.deleteMany({ where: { key } }).then(() => undefined);
  }
}
