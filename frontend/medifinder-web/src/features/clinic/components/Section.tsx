import { cn } from '@/shared/lib/utils';

/**
 * 상세 화면의 한 구역.
 *
 * **비급여가 페이지로 갈라지면서 HospitalDetail 밖으로 나왔다.** 두 페이지가 같은 껍데기를
 * 써야 갈라진 티가 안 난다 — 비급여만 여백·제목 모양이 다르면 다른 사이트처럼 보인다.
 */
export function Section({
  title,
  icon,
  children,
  id,
  first,
  action,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  /** 책갈피 대상. 헤더의 지역 줄에서 여기로 스크롤한다. */
  id?: string;

  /** 첫 섹션. 위쪽 구분선을 그리지 않는다 — 바로 위 탭의 밑줄과 겹쳐 이중선이 된다. */
  first?: boolean;

  /**
   * 제목 줄 오른쪽 끝에 붙일 것(주로 토글 버튼).
   *
   * 본문 아래에 두면 **스크롤을 다 내려야 보인다** — 구역 단위로 켜고 끄는 조작은
   * 그 구역을 읽기 시작하는 자리, 즉 제목 옆에 있어야 눈에 걸린다.
   */
  action?: React.ReactNode;
}) {
  return (
    <section
      id={id}
      /*
        **카드가 아니다.** 예전엔 섹션마다 흰 카드(테두리+그림자)를 둘렀는데,
        탭이 이미 구역을 나누고 있어 카드가 그 일을 두 번 한다 — 화면이 조각조각 끊긴다.
        선 하나로 나누고 한 장의 흐름으로 읽히게 한다.
        scroll-mt: sticky 바(56 + 44px)에 제목이 가리지 않도록 위를 비운다.
      */
      className={cn(first ? 'pt-1' : 'border-t border-slate-200 pt-5')}
      style={{ scrollMarginTop: 'var(--detail-anchor-offset, 112px)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold text-slate-900">
          {icon}
          {title}
        </h2>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}
