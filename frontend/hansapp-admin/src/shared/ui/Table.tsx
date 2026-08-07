import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';

interface Props {
  /**
   * grid 열 정의 + 여백. 헤더 행과 내용 행이 **같은 값**을 써야 세로줄이 맞으므로
   * 화면마다 상수 하나로 두고 여기와 각 행에 함께 넘긴다.
   */
  columns: string;
  head: string[];
  /** 좁은 화면에서 열을 우그러뜨리는 대신 가로 스크롤시킬 최소 폭. */
  minWidth?: string;
  children: ReactNode;
}

/**
 * 표 껍데기. `<table>` 이 아니라 CSS grid 다 — 행 전체를 링크(`<a>`)로 만들려면
 * `<tr>` 안에 링크를 넣는 것보다 grid 행이 훨씬 단순하다.
 */
export function Table({ columns, head, minWidth = 'min-w-[720px]', children }: Props) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
      <div className={minWidth}>
        <div
          className={cn(
            'grid border-b border-gray-200 bg-gray-50 py-3 text-xs font-semibold text-gray-400',
            columns,
          )}
        >
          {head.map((h) => (
            <span key={h}>{h}</span>
          ))}
        </div>
        {children}
      </div>
    </div>
  );
}
