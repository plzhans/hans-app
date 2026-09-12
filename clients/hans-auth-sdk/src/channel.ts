/**
 * 열려 있는 탭들에 **세션이 끝났음**을 알린다. 그것 하나만 한다.
 *
 * **왜 이것만 남았나.** 토큰을 세션 쿠키에 두면(persistence: 'browser') 저장소가 오리진
 * 단위라 탭들이 같은 값을 본다 — 회전한 토큰을 나눠주려고 통신할 이유가 없다.
 *
 * 남는 것은 저장소가 전할 수 없는 하나다. 한 탭에서 로그아웃하면 다른 탭의 **화면**은
 * 그대로 사용자 이름을 달고 있다. 쿠키가 사라진 걸 그 탭이 알아채는 시점은 다음 API 호출이
 * 401 을 맞을 때나 새로고침할 때다. 그때까지 로그아웃한 사람 눈앞에 로그인된 화면이 남는다.
 *
 * **같은 세션일 때만 받아들인다**(sid 대조). 다른 계정으로 따로 로그인한 탭까지 끌고
 * 나가면 안 된다 — 쿠키를 공유하는 지금 구성에서는 드물지만, 저장소 모드는 앱이 정한다.
 *
 * BroadcastChannel 은 **같은 오리진 안에서만** 닿고 네트워크로 나가지 않는다.
 * 토큰 값은 여기에 싣지 않는다. 없는 환경(구형 웹뷰)에서는 조용히 아무것도 하지 않는다.
 */
export interface SessionEvent {
  kind: 'signedOut';
  /** 끝난 세션의 식별자(access token 의 sid). */
  sid: number;
}

/** 앱에 알릴 만한 변화. */
export type SessionChange = SessionEvent['kind'];

export class SessionChannel {
  private readonly channel: BroadcastChannel | null;

  constructor(name: string) {
    this.channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(name);
  }

  /** 보낸 탭에는 오지 않는다(BroadcastChannel 사양) — 자기 이벤트를 되받을 걱정은 없다. */
  publish(event: SessionEvent): void {
    this.channel?.postMessage(event);
  }

  /** 구독. 반환값을 호출하면 해제한다. */
  subscribe(handler: (event: SessionEvent) => void): () => void {
    const channel = this.channel;
    if (!channel) return () => {};
    const listener = (e: MessageEvent<SessionEvent>) => handler(e.data);
    channel.addEventListener('message', listener);
    return () => channel.removeEventListener('message', listener);
  }
}
