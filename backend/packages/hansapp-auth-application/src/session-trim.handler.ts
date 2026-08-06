import { Injectable } from '@nestjs/common';
import { DomainEvent, type AuthLoginEvent } from '@hansapp/event-contract';
import { OnDomainEvent } from '@hansapp/event-consumer';

import { SessionTrimService } from './session-trim.service';

/**
 * 로그인 이벤트 → 세션 상한 정리.
 *
 * **"언제 부를지" 만 여기 있다.** 무엇을 하는지는 SessionTrimService 가 안다 — 처리기를
 * 얇게 두면 같은 일을 다른 계기(관리자 화면·배치)로도 부를 수 있다.
 *
 * **처리기가 앱이 아니라 이 계층에 있는 이유.** 소비를 다른 서버로 옮길 때 그 서버가
 * AuthModule 을 등록하는 것으로 끝나야 한다 — 처리기가 앱에 있으면 옮길 때마다 파일이
 * 따라다니고, 옮기는 도중에 두 프로세스가 같은 이벤트를 다투게 된다.
 *
 * **던지면 그대로 올린다.** 소비자(BullMQ)가 실패로 보고 재시도한다 — 여기서 삼키면
 * "성공" 으로 기록되어 영영 다시 시도되지 않는다.
 */
@Injectable()
export class SessionTrimHandler {
  constructor(private readonly trim: SessionTrimService) {}

  @OnDomainEvent(DomainEvent.AuthLogin)
  onLogin(event: AuthLoginEvent): Promise<void> {
    return this.trim.trim(event.userId);
  }
}
