import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';

import { cn } from '@/shared/lib/cn';

export interface ComboOption {
  value: string;
  label: string;
  /** 라벨 아래 흐리게 붙는 보조 설명. 검색어도 여기까지 훑는다. */
  description?: string;
}

interface Props {
  label?: string;
  hint?: string;
  error?: string;
  options: readonly ComboOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  emptyText?: string;
}

/**
 * 검색해서 고르는 선택 입력.
 *
 * **목록이 길 때 `<select>` 로는 못 고른다.** 타임존만 400개가 넘어서, 스크롤로 찾으려면
 * 자기 도시가 어느 대륙 아래에 있는지부터 알아야 한다. 타이핑으로 좁히는 편이 빠르다.
 *
 * 라이브러리를 붙이지 않은 것은 이 화면 말고 쓸 데가 아직 없어서다 — react-select 한 벌이
 * 번들에 들어오는 것보다, 필요한 동작(검색·키보드·바깥클릭)만 여기 두는 편이 싸다.
 */
export function ComboBox({
  label,
  hint,
  error,
  options,
  value,
  onChange,
  disabled,
  placeholder,
  emptyText = '검색 결과가 없습니다.',
}: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((option) => option.value === value);

  const filtered = useMemo(() => {
    const terms = normalize(query).split(' ').filter(Boolean);
    if (!terms.length) return options;
    return options.filter((option) => {
      const haystack = normalize(
        `${option.label} ${option.value} ${option.description ?? ''}`,
      );
      // 낱말을 모두 만족해야 한다 — "asia seoul" 처럼 순서를 몰라도 걸린다.
      return terms.every((term) => haystack.includes(term));
    });
  }, [options, query]);

  const openList = () => {
    if (disabled || open) return;
    setQuery('');
    // 지금 고른 값 위에서 열어야 목록이 "어디쯤인지" 를 보여준다.
    setHighlight(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const select = (option: ComboOption) => {
    onChange(option.value);
    close();
  };

  // 바깥을 누르면 닫는다. 열려 있는 동안만 듣는다.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // 강조된 줄을 보이는 곳으로 끌어온다. 키보드로만 움직일 때 화면 밖으로 나가지 않게.
  useEffect(() => {
    if (!open) return;
    listRef.current?.children[highlight]?.scrollIntoView({ block: 'nearest' });
  }, [open, highlight]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        openList();
        return;
      }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setHighlight((prev) => {
        if (!filtered.length) return 0;
        return (prev + step + filtered.length) % filtered.length;
      });
      return;
    }
    if (event.key === 'Enter' && open) {
      event.preventDefault();
      const option = filtered[highlight];
      if (option) select(option);
      return;
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      close();
    }
  };

  return (
    <div className="block" ref={rootRef}>
      {label && (
        <span className="mb-1 block text-sm font-medium text-gray-700">
          {label}
        </span>
      )}
      {hint && <p className="mb-1 -mt-0.5 text-xs text-gray-400">{hint}</p>}

      <div className="relative">
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          // 브라우저 자동완성이 목록 위에 겹쳐 뜨면 아무것도 못 고른다.
          autoComplete="off"
          disabled={disabled}
          // 닫혀 있을 때는 고른 값을, 열면 빈칸에서 검색을 시작한다.
          value={open ? query : (selected?.label ?? value)}
          placeholder={open ? (selected?.label ?? placeholder) : placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlight(0);
            setOpen(true);
          }}
          onFocus={openList}
          onClick={openList}
          onKeyDown={onKeyDown}
          className={cn(
            'h-11 w-full rounded-lg border bg-white pr-9 pl-3 text-sm outline-none transition',
            'focus:border-primary focus:ring-2 focus:ring-primary-100',
            'disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400',
            error ? 'border-red-400' : 'border-gray-300',
          )}
        />

        <svg
          aria-hidden
          viewBox="0 0 20 20"
          className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-gray-400"
        >
          <path
            d="M6 8l4 4 4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        {open && (
          <ul
            id={listId}
            ref={listRef}
            role="listbox"
            className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-400">{emptyText}</li>
            ) : (
              filtered.map((option, index) => (
                <li
                  key={option.value}
                  role="option"
                  aria-selected={option.value === value}
                  /*
                    click 이 아니라 pointerdown 에서 고른다. click 은 blur 뒤에 오는데,
                    그 사이에 목록이 닫혀 버려 첫 번째 누름이 먹지 않는다.
                  */
                  onPointerDown={(e) => {
                    e.preventDefault();
                    select(option);
                  }}
                  onPointerEnter={() => setHighlight(index)}
                  className={cn(
                    'cursor-pointer px-3 py-2 text-sm',
                    index === highlight ? 'bg-primary-50' : 'bg-white',
                    option.value === value
                      ? 'font-semibold text-primary-700'
                      : 'text-gray-700',
                  )}
                >
                  {option.label}
                  {option.description && (
                    <span className="mt-0.5 block text-xs font-normal text-gray-400">
                      {option.description}
                    </span>
                  )}
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      {error && <span className="mt-1 block text-xs text-red-500">{error}</span>}
    </div>
  );
}

/** 검색 대조용으로 다듬는다. `America/New_York` 과 "new york" 이 같은 말이 되게. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[_/(),]+/g, ' ');
}
