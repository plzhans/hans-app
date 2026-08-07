import { ChevronLeft, ChevronRight } from 'lucide-react';

import { cn } from '@/shared/lib/cn';

interface Props {
  /** 현재 페이지(1부터). 백엔드 PageResponseDto.page 와 같은 기준이다. */
  page: number;
  totalPages: number;
  totalCount: number;
  onChange: (page: number) => void;
}

/** 현재 페이지 좌우로 보여 줄 이웃 수. 5 페이지 창(현재 ±2)이 된다. */
const NEIGHBORS = 2;

/**
 * 번호 페이저.
 *
 * **총 페이지가 많아도 번호를 다 그리지 않는다.** 현재 페이지 주변만 창으로 보여 주고
 * 양 끝(1, 마지막)은 항상 남긴다 — 회원이 늘면 수백 페이지가 되는데 그걸 전부 그리면
 * 페이저가 화면을 덮는다. 건너뛴 구간은 `…` 로 표시한다.
 */
export function Pagination({ page, totalPages, totalCount, onChange }: Props) {
  // 한 페이지뿐이면 페이저가 할 일이 없다. 총건수만 남긴다.
  if (totalPages <= 1) {
    return (
      <p className="py-4 text-center text-sm text-gray-400">
        전체 {totalCount.toLocaleString()}건
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-4">
      <p className="text-sm text-gray-400">
        전체 {totalCount.toLocaleString()}건 · {page}/{totalPages} 페이지
      </p>

      <nav className="flex items-center gap-1" aria-label="페이지 이동">
        <PageButton
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          label="이전 페이지"
        >
          <ChevronLeft className="h-4 w-4" />
        </PageButton>

        {buildPageItems(page, totalPages).map((item, i) =>
          item === 'gap' ? (
            <span key={`gap-${i}`} className="px-1 text-sm text-gray-300">
              …
            </span>
          ) : (
            <PageButton
              key={item}
              onClick={() => onChange(item)}
              current={item === page}
              label={`${item} 페이지`}
            >
              {item}
            </PageButton>
          ),
        )}

        <PageButton
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
          label="다음 페이지"
        >
          <ChevronRight className="h-4 w-4" />
        </PageButton>
      </nav>
    </div>
  );
}

function PageButton({
  children,
  onClick,
  disabled,
  current,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  current?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-current={current ? 'page' : undefined}
      className={cn(
        'inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm transition',
        'disabled:cursor-not-allowed disabled:opacity-40',
        current
          ? 'bg-primary font-semibold text-white'
          : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
      )}
    >
      {children}
    </button>
  );
}

/**
 * 그릴 번호 목록을 만든다. `'gap'` 은 생략 표시(`…`) 자리다.
 *
 * 예) 총 20페이지에서 현재 10 → `1 … 8 9 10 11 12 … 20`
 */
export function buildPageItems(
  page: number,
  totalPages: number,
): (number | 'gap')[] {
  const window = new Set<number>([1, totalPages]);
  for (let p = page - NEIGHBORS; p <= page + NEIGHBORS; p++) {
    if (p >= 1 && p <= totalPages) window.add(p);
  }

  const sorted = [...window].sort((a, b) => a - b);
  const items: (number | 'gap')[] = [];
  let prev = 0;
  for (const p of sorted) {
    // 번호가 하나만 비었으면 `…` 대신 그 번호를 그린다 — 폭이 같은데 누르기까지 된다.
    if (prev && p - prev === 2) items.push(prev + 1);
    else if (prev && p - prev > 2) items.push('gap');
    items.push(p);
    prev = p;
  }
  return items;
}
