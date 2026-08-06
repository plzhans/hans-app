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
} as const;

export type DomainEventName = (typeof DomainEvent)[keyof typeof DomainEvent];

/** 로그인 성립. **"무슨 일이 있었나" 만 담는다** — 무엇을 해야 하는지는 받는 쪽이 정한다. */
export interface AuthLoginEvent {
  readonly userId: number;
  /** 이번 로그인으로 만들어진 세션. 이 세션은 남겨야 하는 대상이다. */
  readonly sessionId: string;
}

/** 이벤트 이름 → 그 내용. 발행·구독 양쪽의 타입이 이 표에서 나온다. */
export interface DomainEventPayloads {
  [DomainEvent.AuthLogin]: AuthLoginEvent;
}
