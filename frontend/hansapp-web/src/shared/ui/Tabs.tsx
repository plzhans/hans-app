/**
 * 폴더 탭. 같은 자리에서 내용만 갈아 끼울 때 쓴다 —
 * 페이지가 갈리는 이동이면 탭이 아니라 링크여야 한다.
 *
 * 아래로 그은 선이 **고른 탭에서만 끊긴다.** 탭의 아랫변을 지우고 그 1px 만큼 끌어내려
 * 선 위에 겹쳐 앉히면(-mb-px) 고른 탭만 아래 내용과 뚫려 이어진 모양이 된다:
 *
 *     ┌──────┐
 *  ───┘      └────────────────
 *
 * 선을 안 고른 탭 쪽에서는 그대로 잇는다(border-b-gray-200) — 그래야 탭 줄 전체가
 * 하나의 띠로 읽히고, 끊긴 자리가 곧 "지금 여기" 가 된다.
 */
export function Tabs<T extends string>({
  value,
  onChange,
  items,
  className,
}: {
  value: T;
  onChange: (next: T) => void;
  items: { value: T; label: string; count?: number }[];
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={`flex items-end gap-1 border-b border-gray-200 ${className ?? ''}`}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            /*
              테두리는 양쪽 다 두른다(안 고른 쪽은 투명). 한쪽만 두르면 그 1px 만큼
              키가 달라져서 탭을 옮길 때마다 글자가 위아래로 튄다.
            */
            className={`-mb-px inline-flex items-center gap-2 rounded-t-lg border px-5 py-2.5 text-sm font-semibold transition ${
              active
                ? 'border-gray-200 border-b-white bg-white text-primary'
                : 'border-transparent border-b-gray-200 text-gray-500 hover:bg-gray-100 hover:text-gray-800'
            }`}
          >
            {item.label}
            {item.count !== undefined && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                  active
                    ? 'bg-primary-50 text-primary'
                    : 'bg-gray-200 text-gray-500'
                }`}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
