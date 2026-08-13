import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { Check, ChevronDown } from 'lucide-react';

import { cn } from '@/shared/lib/cn';

export interface MultiSelectOption {
  value: string;
  label: string;
  /** 라벨 아래 흐리게 붙는 보조 설명. 검색어도 여기까지 훑는다. */
  description?: string;
}

interface Props {
  options: readonly MultiSelectOption[];
  /** 고른 값들. 순서는 `options` 순서로 맞춰 돌려준다 — 쿼리스트링이 흔들리지 않게. */
  value: readonly string[];
  onChange: (next: string[]) => void;
  /**
   * 아무것도 고르지 않은 상태의 이름.
   *
   * **빈 선택은 "안 고름" 이 아니라 "전체" 다.** 로그 조건이 그렇게 동작한다 —
   * 종류를 비우면 모든 종류가 나온다. 목록 맨 위 줄의 이름이기도 하다.
   */
  allLabel?: string;
  /** 이 개수를 넘으면 목록 위에 검색 칸이 붙는다. */
  searchThreshold?: number;
  disabled?: boolean;
  className?: string;
}

/**
 * 여러 개를 고르는 선택 상자.
 *
 * **칩을 늘어놓던 자리를 대신한다.** 종류는 계속 늘어나는데 칩은 늘어난 만큼 가로로
 * 번지고, 줄바꿈이 시작되면 조건 줄이 화면의 절반을 먹는다. 접어 두면 항목이 몇 개든
 * 조건 줄의 높이가 같다.
 *
 * 한 벌짜리 [`ComboBox`](./ComboBox.tsx)와 나란한 물건이다. 그쪽은 고르면 닫히지만
 * 여기는 **고른 뒤에도 열려 있다** — 여러 개를 이어서 켜고 끄는 게 이 상자의 용도다.
 */
export function MultiSelect({
  options,
  value,
  onChange,
  allLabel = '전체',
  searchThreshold = 10,
  disabled,
  className,
}: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const searchable = options.length > searchThreshold;
  const selected = new Set(value);

  const filtered = useMemo(() => {
    const terms = normalize(query).split(' ').filter(Boolean);
    if (!terms.length) return options;
    return options.filter((option) => {
      const haystack = normalize(
        `${option.label} ${option.value} ${option.description ?? ''}`,
      );
      // 낱말을 모두 만족해야 한다 — 순서를 몰라도 걸린다.
      return terms.every((term) => haystack.includes(term));
    });
  }, [options, query]);

  /*
    강조 줄의 번호는 **"전체" 줄을 0 번으로 둔 목록** 기준이다. 화면에 보이는 순서와
    번호가 같아야 위아래 키가 눈에 보이는 대로 움직인다.
  */
  const rows = filtered.length + 1;

  const openPanel = () => {
    if (disabled || open) return;
    setQuery('');
    setHighlight(0);
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  /** 고른 값을 `options` 순서로 다시 세운다. 켠 순서대로 쌓으면 URL 이 흔들린다. */
  const toggle = (option: MultiSelectOption) => {
    const next = new Set(value);
    if (next.has(option.value)) {
      next.delete(option.value);
    } else {
      next.add(option.value);
    }
    onChange(options.filter((o) => next.has(o.value)).map((o) => o.value));
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

  /*
    열면 키보드를 받을 자리로 초점을 옮긴다. 검색 칸이 있으면 그쪽이고, 없으면 패널이다 —
    **초점이 트리거에 남아 있으면 위아래 키가 페이지를 스크롤한다.**
  */
  useEffect(() => {
    if (!open) return;
    (searchable ? inputRef : panelRef).current?.focus();
  }, [open, searchable]);

  // 강조된 줄을 보이는 곳으로 끌어온다. 키보드로만 움직일 때 화면 밖으로 나가지 않게.
  useEffect(() => {
    if (!open) return;
    listRef.current?.children[highlight]?.scrollIntoView({ block: 'nearest' });
  }, [open, highlight]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setHighlight((prev) => (prev + step + rows) % rows);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      // 검색 칸에서 띄어쓰기는 글자다. 낱말을 여럿 치는 검색이라 막으면 안 된다.
      if (event.key === ' ' && searchable) return;
      event.preventDefault();
      if (highlight === 0) {
        onChange([]);
        return;
      }
      const option = filtered[highlight - 1];
      if (option) toggle(option);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      triggerRef.current?.focus();
    }
  };

  return (
    <div className={cn('relative', className)} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => (open ? close() : openPanel())}
        onKeyDown={(event) => {
          if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault();
            openPanel();
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        className={cn(
          'flex h-8 min-w-[9rem] max-w-[22rem] items-center gap-1.5 rounded-lg border py-1 pr-2 pl-3 text-sm transition',
          'focus:border-primary focus:ring-2 focus:ring-primary-100 focus:outline-none',
          'disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400',
          open ? 'border-primary ring-2 ring-primary-100' : 'border-gray-300',
          value.length ? 'bg-primary-50' : 'bg-white',
        )}
      >
        <Summary
          options={options}
          value={value}
          allLabel={allLabel}
          selected={selected}
        />
        <ChevronDown
          aria-hidden
          className={cn(
            'ml-auto h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div
          ref={panelRef}
          tabIndex={-1}
          onKeyDown={searchable ? undefined : onKeyDown}
          className="absolute z-20 mt-1 w-64 rounded-lg border border-gray-200 bg-white shadow-lg focus:outline-none"
        >
          {searchable && (
            <div className="border-b border-gray-100 p-2">
              <input
                ref={inputRef}
                type="text"
                value={query}
                placeholder="찾기"
                autoComplete="off"
                onChange={(e) => {
                  setQuery(e.target.value);
                  setHighlight(0);
                }}
                onKeyDown={onKeyDown}
                className="h-8 w-full rounded-md border border-gray-200 px-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-100"
              />
            </div>
          )}

          <ul
            id={listId}
            ref={listRef}
            role="listbox"
            aria-multiselectable
            className="max-h-64 overflow-auto py-1"
          >
            {/*
              **"전체" 는 항목이 아니라 지우개다.** 다른 줄과 함께 켜지는 값이 아니라,
              누르면 고른 것을 모두 비운다. 그래서 체크 상자가 아니라 점으로 표시한다.
            */}
            <Row
              highlighted={highlight === 0}
              selected={value.length === 0}
              onPointerEnter={() => setHighlight(0)}
              onSelect={() => onChange([])}
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    value.length === 0 ? 'bg-primary' : 'bg-gray-300',
                  )}
                />
              </span>
              {allLabel}
            </Row>

            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-400">
                찾는 종류가 없습니다.
              </li>
            ) : (
              filtered.map((option, index) => {
                const on = selected.has(option.value);
                return (
                  <Row
                    key={option.value}
                    highlighted={highlight === index + 1}
                    selected={on}
                    onPointerEnter={() => setHighlight(index + 1)}
                    onSelect={() => toggle(option)}
                  >
                    <span
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition',
                        on
                          ? 'border-primary bg-primary text-white'
                          : 'border-gray-300 bg-white',
                      )}
                    >
                      {on && <Check className="h-3 w-3" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0">
                      {option.label}
                      {option.description && (
                        <span className="mt-0.5 block text-xs font-normal text-gray-400">
                          {option.description}
                        </span>
                      )}
                    </span>
                  </Row>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * 닫힌 상태에 보이는 요약.
 *
 * 고른 것이 여럿이면 **첫 항목 이름 + 나머지 개수**로 줄인다. 이름을 모두 이어 붙이면
 * 상자가 조건 줄을 밀어내고, 개수만 적으면("3개 선택") 무엇을 골랐는지가 사라진다.
 */
function Summary({
  options,
  value,
  allLabel,
  selected,
}: {
  options: readonly MultiSelectOption[];
  value: readonly string[];
  allLabel: string;
  selected: Set<string>;
}) {
  if (value.length === 0) {
    return <span className="truncate text-gray-500">{allLabel}</span>;
  }

  const first = options.find((option) => selected.has(option.value));
  return (
    <>
      <span className="truncate font-semibold text-primary-700">
        {first?.label ?? value[0]}
      </span>
      {value.length > 1 && (
        <span className="shrink-0 rounded-md bg-primary-100 px-1.5 text-xs font-semibold text-primary-700">
          +{value.length - 1}
        </span>
      )}
    </>
  );
}

function Row({
  highlighted,
  selected,
  onPointerEnter,
  onSelect,
  children,
}: {
  highlighted: boolean;
  selected: boolean;
  onPointerEnter: () => void;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <li
      role="option"
      aria-selected={selected}
      /*
        click 이 아니라 pointerdown 에서 고른다. click 은 blur 뒤에 오는데, 그 사이에
        검색 칸이 초점을 잃어 이어서 타이핑할 수 없다. preventDefault 로 초점을 붙잡는다.
      */
      onPointerDown={(e) => {
        e.preventDefault();
        onSelect();
      }}
      onPointerEnter={onPointerEnter}
      className={cn(
        'flex cursor-pointer items-center gap-2 px-3 py-2 text-sm',
        highlighted ? 'bg-primary-50' : 'bg-white',
        selected ? 'font-semibold text-primary-700' : 'text-gray-700',
      )}
    >
      {children}
    </li>
  );
}

/** 검색 대조용으로 다듬는다. `PASSWORD_CHANGE` 와 "password change" 가 같은 말이 되게. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[_/(),]+/g, ' ');
}
