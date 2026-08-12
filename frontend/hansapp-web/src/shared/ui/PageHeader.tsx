import type { ReactNode } from 'react';

/**
 * 페이지 머리. 제목 + 설명, 오른쪽에 그 페이지의 주 행동.
 *
 * **한 벌로 둔다.** 화면마다 손으로 쓰면 글자 크기와 위아래 여백이 조금씩 달라지고,
 * 페이지를 옮길 때마다 제목이 미세하게 움직인다 — 그게 "덜 만든 사이트" 로 읽힌다.
 */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex items-end justify-between gap-6">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {description && (
          <p className="mt-1.5 text-sm text-gray-500">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
