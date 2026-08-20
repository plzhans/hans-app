import { Module, type DynamicModule } from '@nestjs/common';
import type { ConfigSource } from '@hansapp/common';

import { JobLockService } from './job-lock.service';

/**
 * 분산 락 모듈.
 *
 * **전역이 아니다.** 락이 필요한 앱만 명시적으로 가져간다 — 어디서나 쓸 수 있게 열어 두면
 * "여기도 한 번 걸어 두자" 가 늘어나고, 락은 늘어날수록 서로를 기다리게 만든다.
 */
@Module({})
export class LockModule {
  static forRoot(source: ConfigSource): DynamicModule {
    return {
      module: LockModule,
      providers: [{ provide: JobLockService, useFactory: () => new JobLockService(source) }],
      exports: [JobLockService],
    };
  }
}
