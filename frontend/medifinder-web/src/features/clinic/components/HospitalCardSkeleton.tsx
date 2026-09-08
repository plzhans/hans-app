import { cn } from '@/shared/lib/utils';
import type { HospitalCardVariant } from './HospitalCard';

/**
 * HospitalCard 의 껍데기. **로딩 중에 카드가 설 자리를 미리 잡는다.**
 *
 * 자리를 안 잡으면 스피너 한 덩어리(약 100px)만 있다가 카드 스무 장(약 2,500px)으로
 * 부풀면서 아래에 있던 것이 통째로 밀린다 — 검색 화면의 모바일 CLS 가 0.5 였던 원인이
 * 이거였다(임계값 0.1).
 *
 * **바깥 상자와 줄 간격을 실제 카드와 같은 클래스로 맞춘다.** 여기서 어긋난 만큼이
 * 그대로 남은 흔들림이 된다. HospitalCard 의 여백을 바꾸면 여기도 같이 바꾼다.
 */
export function HospitalCardSkeleton({
  variant = 'search',
}: {
  variant?: HospitalCardVariant;
}) {
  return (
    // HospitalCard 의 LangLink 와 같은 상자.
    <div className="rounded-2xl border border-line bg-white p-3">
      {/* 배지 줄. 높이는 순위 배지(h-[1.35rem])가 정한다. */}
      <div className="h-[1.35rem] w-20 animate-pulse rounded-full bg-surface-subtle" />

      {/* 이름(h3). 추천·근처 카드는 한 줄로 잘려 한 급 작다. */}
      <div
        className={cn(
          'mt-1 animate-pulse rounded bg-surface-subtle',
          variant === 'search' ? 'h-6 w-2/3' : 'h-5 w-3/4',
        )}
      />

      {/* 역·주소 줄(dl mt-2). */}
      <div className="mt-2 h-4 w-full animate-pulse rounded bg-surface-subtle" />

      {/* 전화 줄. **검색 카드만 싣는다** — 나머지 variant 는 이 줄이 없어 그만큼 짧다. */}
      {variant === 'search' && (
        <div className="mt-1.5 h-4 w-1/3 animate-pulse rounded bg-surface-subtle" />
      )}
    </div>
  );
}
