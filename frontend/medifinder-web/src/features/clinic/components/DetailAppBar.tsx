import { useEffect, useState, type RefObject } from 'react';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useIsWide } from '@/shared/hooks/useIsWide';

/**
 * 상세·비급여의 상단 앱바.
 *
 * **파란 히어로 위에 얹혀 시작한다.** 시안에서 앱바는 히어로 안에 있고, 배경이 없는 대신
 * 반투명 흰 사각 버튼이 그라데이션 위에 떠 있다. 그래서 이 바는 처음엔 배경이 없고 아이콘만
 * 희다 — 히어로가 곧 이 바의 배경이다.
 *
 * **스크롤하면 흰 바로 바뀌고 병원 이름을 받는다.** 시안은 정지 화면이라 이 상태가 없는데,
 * 그대로 두면 히어로가 위로 사라진 뒤 돌아갈 방법이 없어진다 — 앱에는 브라우저 뒤로가기가
 * 없다. 히어로가 지나가는 순간 바가 배경과 이름을 얻어 그 자리를 대신한다.
 *
 * **전역 헤더(로고·검색·언어) 자리를 대신한다.** 헤더를 그대로 두고 그 아래 이 바를 또 얹으면
 * 고정 바가 두 겹이 되어, 390px 화면에서 본문이 그만큼 사라진다(DetailLayout 주석 참고).
 *
 * **넓은 화면에서는 첫 화면에 아예 없다**(floating). 좁은 화면은 히어로가 바 밑으로 파고들어
 * 겹치지만 넓은 화면은 그러지 않아, 파란 표지 위에 뒤로가기만 놓인 흰 띠가 한 겹 얹혔다.
 * 거기엔 브라우저 뒤로가기가 있으니 그 띠는 값을 못 한다 — 히어로가 지나갈 때 내려온다.
 */
export function DetailAppBar({
  barRef,
  title,
  solid,
  floating,
  onBack,
  backLabel,
  actions,
}: {
  /**
   * 바 자신. **높이를 재려고 밖에서 붙잡는다** — 세이프에어리어 때문에 기기마다 다른데,
   * 스크롤 스파이의 판정선과 앵커 이동 여백이 전부 이 높이를 기준으로 잡힌다.
   */
  barRef?: RefObject<HTMLElement | null>;
  title: string;
  /** 히어로가 지나갔는가. 배경·글자색·제목이 한꺼번에 바뀐다(useScrolledPast). */
  solid: boolean;
  /**
   * **자리를 차지하지 않고 본문 위에 떠 있는가.** 아래 히어로가 있는 화면(상세)에서만 참이다.
   *
   * 좁은 화면에서는 어차피 히어로가 바 밑으로 파고들어(--hero-pull) 겹쳐 있지만, 넓은 화면은
   * 그러지 않아 바가 제 자리를 차지한다 — 파란 표지 위에 흰 띠가 한 겹 얹혀, 아직 아무것도
   * 안 내렸는데 뒤로가기만 덩그러니 놓인 흰 머리띠가 된다. 떠 있게 두면 그 띠가 사라지고,
   * 히어로가 지나갈 때 비로소 내려온다(아래 `hidden`).
   *
   * 비급여는 히어로가 없어 이 바가 곧 페이지의 머리다 — 뜨면 탭 바가 그 밑으로 파고든다.
   */
  floating?: boolean;
  /** 뒤로가기. 링크가 아니라 동작이라 함수로 받는다(직전 기록으로 되돌아간다). */
  onBack: () => void;
  backLabel: string;
  /** 오른쪽 끝(공유·언어). 페이지마다 달라서 밖에서 넣는다. */
  actions?: React.ReactNode;
}) {
  /**
   * 넓은 화면에서는 **처음부터 흰 바**다(스크롤과 무관하게 flat). 좁은 화면은 파란 히어로
   * 위에 배경 없이 얹혔다가 스크롤하면서 흰 바로 바뀌는데(solid), 넓은 화면에서 그러면
   * 스크롤할 때마다 위쪽이 접혔다 펴졌다 해서 부산스럽다.
   */
  // **훅을 먼저 부른다.** `solid || useIsWide()` 로 적으면 solid 가 true 일 때 단축평가로
  // 훅이 안 불려, 렌더마다 훅 개수가 달라진다(리액트 규칙 위반).
  const wide = useIsWide();
  const flat = solid || wide;

  return (
    <header
      ref={barRef as React.Ref<HTMLElement>}
      className={cn(
        // 좁든 넓든 늘 붙어 있다. 아래 탭 바까지 한 덩어리라 스크롤 내내 위 영역이 유지된다.
        'sticky top-0 z-40 pt-safe-top transition-all duration-200 ease-native',
        flat
          ? 'bg-surface/90 shadow-nav backdrop-blur-xl'
          : 'bg-transparent shadow-none',

        /*
          넓은 화면에서 히어로 위에 뜬 바(floating). **자리를 비우고 본문 위로 올라간다** —
          sticky 인 채로 두면 첫 화면에 3.25rem 짜리 흰 띠가 남는다.
          `lg:` 로 적는 것은 좁은 화면이 지금 그대로여야 해서다(히어로가 이미 밑으로 파고든다).
        */
        floating && 'lg:fixed lg:inset-x-0',

        /*
          **첫 화면에서는 아예 없다.** 넓은 화면에는 브라우저 뒤로가기가 있어서, 아무것도
          안 내린 상태의 뒤로가기 버튼은 표지를 덮을 값을 못 한다. 히어로가 지나가 이름을
          들어야 할 때(solid) 위에서 내려온다 — 그때부터는 돌아갈 유일한 길이라서다.
        */
        floating &&
          !solid &&
          'lg:pointer-events-none lg:-translate-y-full lg:opacity-0',
      )}
    >
      {/*
        **히어로와 같은 기준선에 선다**(max-w-7xl + 같은 좌우 여백). 예전엔 여기만 max-w-3xl
        이라, 넓은 화면에서 뒤로가기가 가운데 768px 상자의 왼쪽 끝 — 즉 화면 한복판 어딘가에
        떠 있었다. 히어로의 병원 이름과 목차 기둥은 훨씬 바깥에서 시작하는데 혼자 안쪽이었다.

        여백이 히어로(px-5 / lg:px-8)보다 한 단계 작은 것은 **버튼 때문**이다. 아이콘은 37.6px
        버튼 안에서 9px 쯤 안쪽에 그려지므로, 그만큼 덜 주어야 글자와 눈으로 같은 선에 선다.
      */}
      <div className="mx-auto flex h-[3.25rem] max-w-7xl items-center gap-1 px-3 lg:px-6">
        <AppBarButton label={backLabel} onClick={onBack} solid={flat}>
          <ChevronLeft className="h-5 w-5" strokeWidth={2.4} />
        </AppBarButton>

        {/*
          제목. 자리는 늘 차지하되(레이아웃이 흔들리지 않게) 보이고 안 보이고만 바뀐다.
          살짝 아래에서 올라오며 나타나 — 히어로의 이름이 이 자리로 옮겨온 것처럼 읽힌다.
        */}
        <h2
          aria-hidden={!solid}
          className={cn(
            'min-w-0 flex-1 truncate px-1 text-center text-[0.95rem] font-extrabold tracking-tight text-ink',
            'transition-all duration-200 ease-native',
            solid
              ? 'translate-y-0 opacity-100'
              : 'pointer-events-none translate-y-1 opacity-0',
          )}
        >
          {title}
        </h2>

        {/*
          오른쪽 끝. **글자색을 여기서 정해 아래로 물려준다** — 히어로 위에서는 희고 흰 바에서는
          먹색이어야 하는데, 넣는 쪽(언어 전환 등)이 그 상태를 알 필요는 없다. 받는 쪽은
          text-current 로 이 색을 그대로 쓴다.
        */}
        <div
          className={cn(
            'flex shrink-0 items-center gap-1.5 transition-colors duration-200',
            flat ? 'text-ink-body' : 'text-white',
          )}
        >
          {actions}
        </div>
      </div>
    </header>
  );
}

/**
 * 앱바 버튼.
 *
 * **히어로 위에서는 반투명 흰 사각형, 흰 바에서는 그냥 아이콘**이다. 시안의 사각 버튼
 * (`rgba(255,255,255,.16)` + blur)은 파란 배경 위에서 아이콘을 읽히게 하려고 깐 판이라,
 * 흰 배경으로 바뀌면 회색 사각형만 남아 지저분해진다.
 */
export function AppBarButton({
  label,
  onClick,
  solid,
  children,
}: {
  label: string;
  onClick?: () => void;
  solid: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'flex h-[2.35rem] w-[2.35rem] shrink-0 items-center justify-center rounded-box',
        'transition-all duration-150 ease-native active:scale-90',
        solid
          ? 'text-ink-body active:bg-surface-subtle'
          : 'bg-white/20 text-white backdrop-blur-sm active:bg-white/30',
      )}
    >
      {children}
    </button>
  );
}

/**
 * 이 요소가 화면 위로 지나갔는가.
 *
 * **scroll 이벤트로 좌표를 재지 않는다.** 스크롤할 때마다 getBoundingClientRect 를 부르면
 * 매 프레임 레이아웃을 다시 계산해서 손가락에 걸리는 게 느껴진다. IntersectionObserver 는
 * 그 판정을 브라우저가 알아서 하고, 상태가 바뀔 때만 알려준다.
 *
 * 판정선은 앱바 바로 아래다. 요소가 그 선 위로 올라가 바에 가려지는 순간 true 가 된다 —
 * 즉 "이제 바가 이 이름을 대신 들어야 한다" 는 신호와 정확히 같다.
 *
 * **바 높이를 재서 쓴다.** rootMargin 은 px 과 % 만 받는다 — CSS 변수도 calc() 도 못 넣어서
 * `--nav-height` 를 그대로 넘길 수가 없다. 그리고 그 높이는 세이프에어리어만큼 기기마다
 * 달라서 56 으로 박아두면 노치 기기에서 이름이 한 박자 늦게 나타난다.
 */
export function useScrolledPast(bar: RefObject<HTMLElement | null>): {
  /** 지켜볼 요소에 그대로 붙인다(`ref={targetRef}`). */
  targetRef: (el: HTMLElement | null) => void;
  past: boolean;
} {
  /**
   * 지켜볼 요소를 **ref 가 아니라 state 로 든다.**
   *
   * ref 로 받으면 이 훅이 조용히 죽는다 — 첫 렌더에는 아직 병원을 불러오는 중이라 히어로가
   * 없고, 그래서 `ref.current` 가 null 이다. effect 는 거기서 그냥 빠져나가는데, 의존성이
   * ref 객체(항상 같은 값)뿐이라 **데이터가 도착해 이름이 생겨도 다시 돌지 않는다.**
   * 그러면 앱바가 영영 투명한 채로 남아, 화면 맨 위 55px 로 본문이 비쳐 보인다.
   *
   * state 로 두면 요소가 붙는 순간 값이 바뀌어 effect 가 다시 돈다. useState 의 setter 는
   * 항상 같은 함수라 콜백 ref 로 그대로 넘겨도 매 렌더 붙었다 떨어졌다 하지 않는다.
   */
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [past, setPast] = useState(false);

  useEffect(() => {
    if (!target) return;

    let observer: IntersectionObserver | undefined;

    const attach = () => {
      observer?.disconnect();
      const offset = Math.round(bar.current?.offsetHeight ?? 56);
      observer = new IntersectionObserver(
        ([entry]) => setPast(!entry.isIntersecting),
        // 위쪽 판정선만 내려 긋는다. 아래는 그대로 둬야, 요소가 화면 아래로 빠질 때와
        // 위로 지나갈 때를 같은 신호로 다루지 않는다.
        { rootMargin: `-${offset}px 0px 0px 0px`, threshold: 0 },
      );
      observer.observe(target);
    };

    attach();

    // 바 높이는 첫 렌더에 0 이고, 세이프에어리어가 뒤늦게 들어오기도 한다. 바뀌면 다시 긋는다.
    const barEl = bar.current;
    const resize = barEl && new ResizeObserver(attach);
    if (barEl && resize) resize.observe(barEl);

    return () => {
      observer?.disconnect();
      resize?.disconnect();
    };
  }, [target, bar]);

  return { targetRef: setTarget, past };
}
