import { Injectable } from '@nestjs/common';
import { DomainEvent, type UserProfileUpdatedEvent } from '@hansapp/event-contract';
import { OnDomainEvent } from '@hansapp/event-consumer';

import { ProfileCache } from './profile-cache.service';

/**
 * 회원 정보 변경 이벤트 → 내 정보 캐시 비우기.
 *
 * **회원 본인이 바꾼 것은 여기로 오지 않는다.** 그건 같은 프로세스 안에서 일어나므로 쓰기
 * 경로가 곧바로 캐시를 비운다. 이 처리기가 받는 것은 **다른 서비스가 바꾼 경우**다 —
 * 지금은 관리자 콘솔이 유일하다.
 *
 * 전달·지연에 관한 사정은 SessionCacheHandler 와 같다(그쪽 주석 참고).
 */
@Injectable()
export class ProfileCacheHandler {
  constructor(private readonly cache: ProfileCache) {}

  @OnDomainEvent(DomainEvent.UserProfileUpdated)
  onUpdated(event: UserProfileUpdatedEvent): Promise<void> {
    return this.cache.invalidate(event.userId);
  }
}
