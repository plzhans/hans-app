import { hasSessionHint } from '@/shared/api/session';

/**
 * **다른 오리진의 로그인·로그아웃을 따라간다.**
 *
 * BroadcastChannel 은 오리진 단위라 인증웹 탭과 포털 탭 사이엔 닿지 않는다. 그런데 힌트
 * 쿠키는 도메인 단위(`.plzhans.com`)이고 non-httpOnly 라 양쪽에서 읽힌다 — 로그아웃하면
 * 서버가 그것을 지우므로, 있고 없음이 바뀌는 순간이 곧 "다른 앱에서 상태가 바뀌었다" 다.
 *
 * **주기 실행을 쓰지 않는다.** `document.cookie` 읽기 자체는 공짜지만 타이머는 기기를 절전에서
 * 깨우고, 모바일에서 열어둔 탭마다 그러면 그대로 배터리다. 그리고 주기가 벌어주는 것도 없다 —
 * 이 탭이 낡아 있으려면 포커스를 잃은 동안이어야 하는데, 다른 창에서 로그아웃하려면 그 창을
 * 클릭해야 하고, 사용자가 돌아오는 순간 focus 가 뜬다. **보는 시점에는 언제나 정확하다.**
 *
 * 그래도 놓치는 경우가 남으면 API 호출이 401 을 맞고 세션이 정리되므로 스스로 수렴한다.
 *
 * @param onChange 힌트 유무가 **바뀔 때만** 부른다(present=true 로그인, false 로그아웃).
 * @returns 감시를 멈추는 함수.
 */
export function watchSessionHint(
  onChange: (present: boolean) => void,
): () => void {
  let last = hasSessionHint();

  const check = (): void => {
    const now = hasSessionHint();
    if (now === last) return;
    last = now;
    onChange(now);
  };

  // 탭 전환으로 돌아왔을 때.
  document.addEventListener('visibilitychange', check);
  // 다른 창에서 이 창으로 넘어왔을 때(같은 탭이 계속 보이는 다중 창 배치).
  window.addEventListener('focus', check);
  // bfcache 로 복원된 페이지는 visibilitychange 없이 되살아날 수 있다.
  window.addEventListener('pageshow', check);

  // 쿠키가 **실제로 바뀔 때만** 깨우는 API(Chromium 계열). 폴링 없이 즉시 반영된다.
  // 다른 오리진이 일으킨 변경까지 전달되는지는 브라우저마다 다를 수 있어 이것에만 기대지 않는다 —
  // 없거나 안 와도 위의 복귀 확인이 받쳐준다.
  const cookieStore = (
    window as unknown as {
      cookieStore?: {
        addEventListener(type: string, listener: () => void): void;
        removeEventListener(type: string, listener: () => void): void;
      };
    }
  ).cookieStore;
  cookieStore?.addEventListener('change', check);

  return () => {
    document.removeEventListener('visibilitychange', check);
    window.removeEventListener('focus', check);
    window.removeEventListener('pageshow', check);
    cookieStore?.removeEventListener('change', check);
  };
}
