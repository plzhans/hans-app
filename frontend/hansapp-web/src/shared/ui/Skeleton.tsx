import { cn } from '@/shared/lib/cn';

/**
 * 불러오는 동안의 자리.
 *
 * **"게시판" 같은 임시 글자를 넣지 않는다.** 잠깐 보였다 바뀌는 글자는 읽는 사람에게 한 번
 * 잘못된 정보를 준다 — 회색 막대는 아무 말도 하지 않아 그럴 일이 없고, 들어올 내용의 크기를
 * 미리 잡아 줘서 화면이 덜컥 밀리지도 않는다.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('block animate-pulse rounded bg-gray-100', className)}
    />
  );
}
