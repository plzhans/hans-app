import { Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';

import { flushSentry } from './instrument';

/**
 * 프로세스 안전망. **어디에도 안 잡힌 오류의 마지막 자리다.**
 *
 * 자바의 `Thread.setDefaultUncaughtExceptionHandler`, .NET 의 `AppDomain.UnhandledException`
 * 에 해당한다. **Node 는 이걸 자동으로 안 걸어 준다** — Sentry SDK 가 기본 통합으로 걸긴
 * 하지만 Sentry 가 꺼진 환경(local·develop)에서는 통째로 없다. 그래서 직접 건다.
 *
 * 잡 실행은 BatchService 의 가드가 이미 감싼다. 여기로 오는 것은 그 밖에서 새어 나간 것 —
 * 타이머 콜백, `.catch` 를 안 단 promise, 라이브러리 내부의 비동기다.
 */
export function installCrashHandlers(logger: Logger): void {
  process.on('unhandledRejection', (reason: unknown) => {
    /*
      **죽이지 않는다.** 어느 promise 가 새었는지 모를 뿐 프로세스 상태는 멀쩡할 수 있고,
      적재 도중이면 이어받기가 밀린다. 대신 반드시 남긴다 — 이런 것이 조용히 사라지는
      상태가 오래 가면 "돌고 있는데 아무 일도 안 일어나는" 배치가 된다.
    */
    logger.error('Unhandled promise rejection', reason);
    Sentry.captureException(reason);
  });

  process.on('uncaughtException', (error: Error) => {
    /*
      **여기서는 죽인다.** 무엇이 깨졌는지 모르는 채로 계속 도는 것이 더 위험하다 —
      .NET 의 BackgroundServiceExceptionBehavior.StopHost 와 같은 판단이다.
      compose 가 restart: unless-stopped 라 곧 다시 뜬다.

      나가기 전에 Sentry 를 flush 한다. 전송이 비동기라 그냥 exit 하면 방금 잡은 것이 날아간다.
    */
    logger.error('Uncaught exception — exiting', error);
    Sentry.captureException(error);
    void flushSentry().finally(() => process.exit(1));
  });
}
