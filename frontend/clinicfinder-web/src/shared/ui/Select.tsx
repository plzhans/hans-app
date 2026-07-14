import * as RadixSelect from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];

  /** 값이 비었을 때 보여줄 문구. "시도 전체" 처럼 '전체' 항목의 이름이기도 하다. */
  placeholder: string;

  disabled?: boolean;
  className?: string;
}

/**
 * 셀렉트. 항목이 수십 개 이하일 때 쓴다. **검색이 없다.**
 * 시군구(250개)처럼 긴 목록은 Combobox 를 써라 — 스크롤로 찾게 하면 못 찾는다.
 *
 * 네이티브 select 는 드롭다운 목록의 스타일을 브라우저가 정해서 앱 디자인과 겉돈다.
 * Radix 는 목록까지 우리가 그린다. 접근성(키보드·포커스·ARIA)은 Radix 가 맡는다.
 */
export function Select({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  className,
}: SelectProps) {
  return (
    <RadixSelect.Root
      // Radix 는 빈 문자열을 값으로 못 쓴다(placeholder 와 구분이 안 되므로).
      // 우리 '전체'는 빈 문자열이라 ALL 로 바꿔 주고받는다.
      value={value === '' ? undefined : value}
      onValueChange={(next) => onChange(next === ALL ? '' : next)}
      disabled={disabled}
    >
      <RadixSelect.Trigger
        className={cn(
          'inline-flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700',
          'hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary-500/30',
          'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400',
          'data-[placeholder]:text-slate-500',
          className,
        )}
      >
        <RadixSelect.Value placeholder={placeholder} />
        <RadixSelect.Icon>
          <ChevronDown className="h-4 w-4 text-slate-400" />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>

      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={4}
          className="z-50 max-h-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
        >
          <RadixSelect.Viewport className="p-1">
            <Item value={ALL}>{placeholder}</Item>
            {options.map((option) => (
              <Item key={option.value} value={option.value}>
                {option.label}
              </Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}

/** '전체'(빈 값)를 나타내는 내부 전용 값. Radix 가 빈 문자열을 금지해서 필요하다. */
const ALL = '__all__';

function Item({ value, children }: { value: string; children: string }) {
  return (
    <RadixSelect.Item
      value={value}
      className={cn(
        'flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-sm text-slate-700 outline-none',
        'data-[highlighted]:bg-slate-50 data-[state=checked]:font-medium data-[state=checked]:text-primary-600',
      )}
    >
      <RadixSelect.ItemText>{children}</RadixSelect.ItemText>
      <RadixSelect.ItemIndicator>
        <Check className="h-4 w-4" />
      </RadixSelect.ItemIndicator>
    </RadixSelect.Item>
  );
}
