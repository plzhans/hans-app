import { useEffect, useRef, useState } from 'react';
import {
  GOOGLE_ADSENSE_CLIENT_ID,
  GOOGLE_ADSENSE_SLOT_LOGIN,
} from '@/shared/config/env';

/**
 * 로그인 화면의 광고 자리. PC 는 카드 오른쪽 단, 모바일은 카드 맨 아래다.
 *
 * **게시자 ID(VITE_GOOGLE_ADSENSE_CLIENT_ID)가 없으면 아무것도 그리지 않는다.** 광고가
 * 없는데 자리만 비워 두면 빈 칸이 남고, PC 는 카드까지 두 배로 벌어진다 — AuthCard 가
 * SHOW_AD_SLOTS 를 보고 그 레이아웃을 켤지 정한다.
 */
export const SHOW_AD_SLOTS = Boolean(GOOGLE_ADSENSE_CLIENT_ID);

/** Tailwind 의 lg. 광고 자리를 고르는 기준이라 그 값과 어긋나면 안 된다. */
const DESKTOP = '(min-width: 1024px)';

/**
 * 지금 화면에 맞는 광고 자리.
 *
 * **CSS 로 한쪽을 숨기지 않고 아예 한쪽만 만든다.** 둘 다 만들어 두면 안 보이는 쪽도 광고를
 * 요청하는데, 구글은 폭이 0 인 자리를 오류로 보고 그 단위를 한동안 비워 둔다.
 */
export function useAdPlacement(): 'side' | 'bottom' {
  const [isDesktop, setIsDesktop] = useState(
    () => window.matchMedia(DESKTOP).matches,
  );

  useEffect(() => {
    const query = window.matchMedia(DESKTOP);
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    // 창 크기가 바뀌면 자리도 옮긴다(개발 중 반응형 확인, 태블릿 회전).
    query.addEventListener('change', onChange);
    setIsDesktop(query.matches);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return isDesktop ? 'side' : 'bottom';
}

/** PC: 카드 오른쪽 단. 여백은 카드 테두리에서 떨어뜨릴 만큼만 — 광고는 클수록 값이 붙는다. */
export function SideAd() {
  return (
    <aside className="hidden items-center justify-center border-l border-gray-100 p-4 lg:flex lg:w-1/2">
      <Creative size="300 x 600" className="h-full min-h-[400px]" />
    </aside>
  );
}

/** 모바일: 카드 맨 아래, 비밀번호 찾기 링크 밑. 폼을 다 지나온 자리라 흐름을 끊지 않는다. */
export function BottomAd() {
  return (
    <div className="mt-5 border-t border-gray-100 pt-4 lg:hidden">
      <Creative size="320 x 100" className="h-[100px]" />
    </div>
  );
}

/**
 * 실을 것. 단위 ID 까지 있으면 진짜 광고, 없으면 자리만 보여준다 — 빈 칸으로 두면 광고가
 * 안 나오는 건지 설정이 덜 된 건지 화면만 봐서는 모른다.
 *
 * **적는 것은 권장 크기뿐이다.** "광고 자리" 라고 써 두면 설정이 덜 된 채로 사용자에게
 * 노출되는 사고가 났을 때 광고를 붙이려다 만 자리로 읽힌다 — 숫자만 있으면 그냥 빈 칸이고,
 * 소재를 만들 때 필요한 정보는 그 숫자다.
 */
function Creative({
  /** 권장 소재 크기(표시용). 상자 자체는 단 폭에 맞춰 늘어난다. */
  size,
  className,
}: {
  size: string;
  className: string;
}) {
  if (!GOOGLE_ADSENSE_SLOT_LOGIN) {
    return (
      <div
        className={`flex w-full items-center justify-center rounded-xl border border-dashed border-gray-300 text-xs text-gray-400 ${className}`}
      >
        {size}
      </div>
    );
  }
  return (
    <AdSenseUnit
      client={GOOGLE_ADSENSE_CLIENT_ID}
      slot={GOOGLE_ADSENSE_SLOT_LOGIN}
      className={className}
    />
  );
}

/** 스크립트는 한 번만 받는다. 광고 자리가 여럿이어도 태그는 하나다. */
function loadAdSenseScript(client: string) {
  const id = 'google-adsense';
  if (document.getElementById(id)) return;
  const script = document.createElement('script');
  script.id = id;
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
  document.head.appendChild(script);
}

/**
 * AdSense 광고 한 자리.
 *
 * **스크립트를 index.html 이 아니라 여기서 받는다.** 광고를 안 켠 환경(게시자 ID 가 빈
 * 경우)까지 구글에 요청이 나가지 않게 하려는 것이다.
 */
function AdSenseUnit({
  client,
  slot,
  className,
}: {
  client: string;
  slot: string;
  className: string;
}) {
  // **한 번만 밀어 넣는다.** StrictMode 는 개발에서 effect 를 두 번 부르는데, 같은 ins 에
  // 두 번 push 하면 구글이 "이미 광고가 있다" 며 거절하고 그 자리는 빈 채로 남는다.
  const pushed = useRef(false);

  useEffect(() => {
    if (pushed.current) return;
    pushed.current = true;
    loadAdSenseScript(client);
    // 스크립트가 아직 안 왔어도 된다 — 큐에 쌓아 두면 도착한 뒤에 처리한다.
    const queue = ((window as unknown as { adsbygoogle?: unknown[] })
      .adsbygoogle ??= []);
    queue.push({});
  }, [client]);

  return (
    <ins
      className={`adsbygoogle block w-full ${className}`}
      style={{ display: 'block' }}
      data-ad-client={client}
      data-ad-slot={slot}
      data-ad-format="auto"
      data-full-width-responsive="true"
    />
  );
}
