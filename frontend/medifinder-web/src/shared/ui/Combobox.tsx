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
   * 선택을 지우는 항목의 이름("전체").
   *
   * **placeholder 와 다르다.** 트리거에는 "시도" 라고 좁게 쓰지만, 목록 안에서 "시도" 라는
   * 항목이 보이면 그게 무슨 뜻인지 알 수 없다. 목록에서는 "전체" 여야 한다.
   *
   * **기본값을 두지 않는다.** 예전에 '전체' 를 박아뒀더니 아무도 안 넘겨서, 영어·일본어
   * 화면에서도 한글이 그대로 나왔다. 문구는 화면이 번역해 주는 게 맞다.
   */
  allLabel: string;

  /** 검색창 안내 문구. 위와 같은 이유로 기본값이 없다. */
  searchPlaceholder: string;

  disabled?: boolean;
  className?: string;

  /**
   * 목록 맨 위에 붙는 **동작 항목**. 고르는 값이 아니라 값을 만들어 주는 일이다
   * (시도 목록의 "내 위치로 찾기" 처럼).
   *
   * 목록 안에 두는 이유는 그 일이 **여기서 고를 값과 같은 것을 정하기** 때문이다 —
   * 밖에 버튼으로 세우면 셀렉트와 나란한 또 하나의 조건처럼 보이고, 좁은 화면에서는
   * 그만큼 셀렉트가 좁아진다.
   *
   * @param onSelect 고르면 실행하고, 끝나면 목록을 닫는다(비동기여도 기다린다).
   */
  action?: {
    icon?: React.ReactNode;
    label: string;
    onSelect: () => void | Promise<void>;
    /** 실행 중인가. 그동안 목록을 열어 두고 다시 못 누르게 한다. */
    busy?: boolean;
  };
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
  allLabel,
  searchPlaceholder,
  disabled,
  className,
  action,
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
          'inline-flex items-center justify-between gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm',
          'hover:border-line focus:outline-none focus:ring-2 focus:ring-brand/30',
          'disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-ink-subtle',
          selected ? 'text-ink-body' : 'text-ink-muted',
          className,
        )}
      >
        {selected?.label ?? placeholder}
        <ChevronDown className="h-4 w-4 text-ink-subtle" />
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-50 w-64 overflow-hidden rounded-xl border border-line bg-white shadow-lg"
        >
          <Command>
            <div className="border-b border-line px-3 py-2">
              <Command.Input
                placeholder={searchPlaceholder}
                className="w-full bg-transparent text-sm text-ink-body outline-none placeholder:text-ink-subtle"
              />
            </div>

            <Command.List className="max-h-64 overflow-y-auto p-1">
              <Command.Empty className="px-2.5 py-6 text-center text-sm text-ink-subtle">
                결과가 없습니다
              </Command.Empty>

              {/*
                동작 항목. 값 목록과 성격이 달라 **선 하나로 갈라 둔다** — 안 그러면
                "내 위치로 찾기" 가 시도 이름 중 하나처럼 읽힌다.
              */}
              {action && (
                <>
                  <Command.Item
                    value={`__action__ ${action.label}`}
                    disabled={action.busy}
                    onSelect={() => {
                      void Promise.resolve(action.onSelect()).then(() =>
                        setOpen(false),
                      );
                    }}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-bold text-brand-strong outline-none',
                      'data-[selected=true]:bg-brand-tint data-[disabled=true]:opacity-60',
                    )}
                  >
                    {action.icon}
                    {action.label}
                  </Command.Item>
                  <span aria-hidden className="my-1 block h-px bg-line" />
                </>
              )}

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
        'flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-sm text-ink-body',
        'data-[selected=true]:bg-surface-subtle',
        selected && 'font-medium text-brand',
      )}
    >
      {children}
      {selected && <Check className="h-4 w-4" />}
    </Command.Item>
  );
}
