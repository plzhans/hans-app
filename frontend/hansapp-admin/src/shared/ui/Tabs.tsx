import { cn } from '@/shared/lib/cn';

export interface TabItem<T extends string> {
  readonly value: T;
  readonly label: string;
}

interface Props<T extends string> {
  items: readonly TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/**
 * 한 화면 안에서 목록을 갈라 보는 탭.
 *
 * 좌측 메뉴를 늘리는 대신 이걸 쓰는 자리는, **같이 관리하지만 성격이 갈리는 것**이다 —
 * 외부 연동의 인증 자격증명과 서비스 키가 그렇다. 메뉴를 늘리면 사이드바가 길어지고
 * 둘이 남남처럼 보인다.
 */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className,
}: Props<T>) {
  return (
    <div
      role="tablist"
      className={cn('flex gap-1 border-b border-gray-200', className)}
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
            className={cn(
              // 밑줄이 경계선 위에 겹쳐 앉도록 -mb-px 로 1px 내린다.
              '-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition',
              active
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-800',
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
