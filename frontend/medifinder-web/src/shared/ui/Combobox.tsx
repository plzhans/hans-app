import { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Command } from 'cmdk';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

import type { SelectOption } from './Select';

interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];

  /** 값이 비었을 때 트리거에 뜨는 문구. "시도" 처럼 짧게 쓴다. */
  placeholder: string;

  /**
   * 선택을 지우는 항목의 이름. 기본 '전체'.
   *
   * **placeholder 와 다르다.** 트리거에는 "시도" 라고 좁게 쓰지만, 목록 안에서 "시도" 라는
   * 항목이 보이면 그게 무슨 뜻인지 알 수 없다. 목록에서는 "전체" 여야 한다.
   */
  allLabel?: string;

  /** 검색창 안내 문구 */
  searchPlaceholder?: string;

  disabled?: boolean;
  className?: string;
}

/**
 * 검색되는 셀렉트.
 *
 * **시군구가 250개다.** 스크롤로 찾게 하면 사용자는 못 찾는다 — 타이핑해서 걸러야 한다.
 * 항목이 수십 개 이하면 Select 를 써라. 검색창이 오히려 방해가 된다.
 *
 * 필터링은 cmdk 가 한다(부분 일치 + 퍼지). 우리가 걸러서 넘기지 않는다.
 */
export function Combobox({
  value,
  onChange,
  options,
  placeholder,
  allLabel = '전체',
  searchPlaceholder = '검색',
  disabled,
  className,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  const select = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        disabled={disabled}
        className={cn(
          'inline-flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm',
          'hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary-500/30',
          'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400',
          selected ? 'text-slate-700' : 'text-slate-500',
          className,
        )}
      >
        {selected?.label ?? placeholder}
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-50 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
        >
          <Command>
            <div className="border-b border-slate-100 px-3 py-2">
              <Command.Input
                placeholder={searchPlaceholder}
                className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
              />
            </div>

            <Command.List className="max-h-64 overflow-y-auto p-1">
              <Command.Empty className="px-2.5 py-6 text-center text-sm text-slate-400">
                결과가 없습니다
              </Command.Empty>

              <Item selected={value === ''} onSelect={() => select('')}>
                {allLabel}
              </Item>

              {options.map((option) => (
                <Item
                  key={option.value}
                  selected={value === option.value}
                  onSelect={() => select(option.value)}
                >
                  {option.label}
                </Item>
              ))}
            </Command.List>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Item({
  children,
  selected,
  onSelect,
}: {
  children: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      // cmdk 는 이 값으로 검색한다. 라벨을 넘겨야 "김해" 로 김해시가 걸린다.
      value={children}
      onSelect={onSelect}
      className={cn(
        'flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-sm text-slate-700',
        'data-[selected=true]:bg-slate-50',
        selected && 'font-medium text-primary-600',
      )}
    >
      {children}
      {selected && <Check className="h-4 w-4" />}
    </Command.Item>
  );
}
