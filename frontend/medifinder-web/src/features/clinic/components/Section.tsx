import { cn } from '@/shared/lib/utils';

/**
 * 상세 화면의 한 구역 = **흰 카드 한 장.**
 *
 * 예전에는 카드를 걷어내고 선으로만 나눴다. 탭이 이미 구역을 나누는데 카드가 그 일을 두 번
 * 한다고 봤기 때문인데, 실제로는 정반대였다 — 회색 바닥 위에 카드가 떠 있어야 "여기부터
 * 저기까지가 한 덩어리" 가 보이고, 선 하나로 나눈 흰 화면은 어디가 끊기는지 안 읽힌다.
 * 지금은 시안대로 회색 바닥(surface-sunken) 위에 흰 카드를 얹는다.
 *
 * **비급여 페이지와 공유한다.** 두 페이지가 같은 껍데기를 써야 갈라진 티가 안 난다 —
 * 비급여만 여백·제목 모양이 다르면 다른 사이트처럼 보인다.
 */
export function Section({
  title,
  icon,
  children,
  id,
  first,
  bare,
  action,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  /** 책갈피 대상. 탭과 빠른 실행이 여기로 스크롤한다. */
  id?: string;

  /** 첫 카드. 위 여백을 뺀다 — 바로 위 탭 바와 간격이 두 번 붙는다. */
  first?: boolean;

  /**
   * 껍데기 없이 제목만. **안에 카드가 들어오는 구역을 위한 것이다.**
   *
   * 흰 카드 안에 흰 카드를 넣으면 사각형 안에 사각형이 되어 어느 쪽이 덩어리인지 안 읽힌다.
   * 병원 카드처럼 **내용 자체가 카드**인 구역은 제목을 회색 바닥에 그냥 얹고, 카드들이
   * 직접 떠 있게 둔다.
   */
  bare?: boolean;

  /**
   * 제목 줄 오른쪽 끝에 붙일 것 — 개수("19개")·기준("표시과목 기준")·토글 버튼.
   *
   * 본문 아래에 두면 **스크롤을 다 내려야 보인다** — 구역 단위로 켜고 끄는 조작이나
   * 그 구역을 어떻게 읽어야 하는지는, 읽기 시작하는 자리인 제목 옆에 있어야 눈에 걸린다.
   */
  action?: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn(
        // 카드가 아닐 때(bare)는 제목만 회색 바닥에 얹는다 — 안에 든 카드가 주인공이다.
        bare
          ? 'px-1'
          : 'rounded-card border border-line-subtle bg-surface p-4 shadow-card',
        /*
          **bare 구역 위에는 선을 긋는다.** 카드는 테두리와 그림자가 "여기부터 다른 덩어리"
          라고 말해주는데, 껍데기를 벗긴 구역에는 그 신호가 없어서 앞 카드에 딸린 꼬리처럼
          읽힌다. 선 하나로 구역이 갈렸다는 것만 알린다 — 카드를 다시 씌우면 안에 든 카드와
          겹쳐 사각형이 이중이 된다.
        */
        !first && (bare ? 'mt-7 border-t border-line pt-7' : 'mt-3.5'),
      )}
      /*
        앵커로 왔을 때 카드가 앱바+탭 바 뒤에 숨지 않게 위를 비운다.
        값은 페이지가 두 바의 실제 높이를 재서 넣는다(HospitalDetail 의 ResizeObserver).
      */
      style={{ scrollMarginTop: 'var(--detail-anchor-offset, 130px)' }}
    >
      <div className="mb-3.5 flex items-center gap-2">
        {/*
          아이콘을 **연한 사각 판 위에 올린다.** 글자 옆에 아이콘만 덩그러니 두면 제목의
          일부인지 장식인지 모호한데, 판을 깔면 "구역 표지" 라는 한 덩어리가 된다.
        */}
        <span className="flex h-[1.55rem] w-[1.55rem] shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand">
          {icon}
        </span>
        <h2 className="text-[0.92rem] font-extrabold tracking-tight text-ink">
          {title}
        </h2>
        {action && (
          <div className="ml-auto flex shrink-0 items-center">{action}</div>
        )}
      </div>
      {children}
    </section>
  );
}
