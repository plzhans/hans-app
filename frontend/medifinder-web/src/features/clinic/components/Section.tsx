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
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  /** 책갈피 대상. 헤더의 지역 줄에서 여기로 스크롤한다. */
  id?: string;

  /** 첫 섹션. 위쪽 구분선을 그리지 않는다 — 바로 위 탭의 밑줄과 겹쳐 이중선이 된다. */
  first?: boolean;
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
      <h2 className="flex items-center gap-2 font-semibold text-slate-900">
        {icon}
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
