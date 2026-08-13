/**
 * 도메인 이벤트 목록과 그 내용.
 *
 * **이 패키지에는 런타임 코드가 없다.** 상수와 타입뿐이다 — 발행자와 소비자가 서로를
 * 참조하지 않으면서도 같은 약속을 보도록, 그 약속만 따로 떼어 둔 자리다.
 * 전달 수단(인프로세스·큐)이 무엇이든 이 파일은 그대로다.
 *
 * **이름을 문자열로 흩어 두지 않는다.** 발행하는 쪽과 받는 쪽이 각자 문자열을 적으면 오타가
 * 조용히 "아무도 안 받는 이벤트" 가 된다 — 실패가 눈에 안 띄는 종류라 더 나쁘다.
 * 여기 한 곳에서 이름과 내용을 같이 정의하고, 양쪽이 이 타입을 통해서만 만난다.
 */
export const DomainEvent = {
  /** 로그인이 성립했다(이메일·소셜·인가코드 교환 — 경로 불문). */
  AuthLogin: 'auth.login',
  /** 로그인 세션이 폐기됐다(관리자 조치). 세션 캐시를 들고 있는 쪽이 비워야 한다. */
  AuthSessionRevoked: 'auth.session.revoked',
  /** 회원 정보가 다른 서비스에서 바뀌었다(관리자 조치). 내 정보 캐시를 비워야 한다. */
  UserProfileUpdated: 'user.profile.updated',
} as const;

export type DomainEventName = (typeof DomainEvent)[keyof typeof DomainEvent];

/** 로그인 성립. **"무슨 일이 있었나" 만 담는다** — 무엇을 해야 하는지는 받는 쪽이 정한다. */
export interface AuthLoginEvent {
  readonly userId: number;
  /** 이번 로그인으로 만들어진 세션. 이 세션은 남겨야 하는 대상이다. */
  readonly sessionId: string;
}

/**
 * 로그인 세션 폐기(관리자 조치).
 *
 * **끊은 세션을 열거해 담는다.** 받는 쪽이 캐시에서 지울 대상을 그대로 알아야 하는데,
 * "이 회원의 세션이 지워졌다" 만 오면 어느 키를 지울지 다시 조회해야 한다 — 그 시점엔
 * 행이 이미 없어 알아낼 방법도 없다.
 */
export interface AuthSessionRevokedEvent {
  readonly userId: number;
  /** 폐기된 세션들. 한 대만 끊었으면 한 개다. */
  readonly sessionIds: readonly string[];
}

/**
 * 회원 정보 변경(관리자 조치).
 *
 * **무엇이 바뀌었는지는 담지 않는다.** 받는 쪽이 하는 일은 캐시를 통째로 비우는 것이라
 * 어느 필드인지 알 필요가 없고, 필드를 담기 시작하면 값이 늘 때마다 이 계약이 따라 커진다.
 */
export interface UserProfileUpdatedEvent {
  readonly userId: number;
}

/** 이벤트 이름 → 그 내용. 발행·구독 양쪽의 타입이 이 표에서 나온다. */
export interface DomainEventPayloads {
  [DomainEvent.AuthLogin]: AuthLoginEvent;
  [DomainEvent.AuthSessionRevoked]: AuthSessionRevokedEvent;
  [DomainEvent.UserProfileUpdated]: UserProfileUpdatedEvent;
}
