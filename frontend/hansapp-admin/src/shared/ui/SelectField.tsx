import { forwardRef, type SelectHTMLAttributes } from 'react';

import { cn } from '@/shared/lib/cn';
import { INLINE_GRID, INLINE_SUB } from './TextField';

interface Option {
  value: string;
  label: string;
}

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  options: readonly Option[];
  /** 라벨을 왼쪽에 둔다. TextField 의 같은 이름과 같은 뜻이고, 격자도 같은 값을 쓴다. */
  inline?: boolean;
}

/** TextField 와 짝을 이루는 선택 입력. 높이·테두리·포커스 링을 같은 값으로 맞춘다. */
export const SelectField = forwardRef<HTMLSelectElement, Props>(
  ({ label, hint, error, options, className, inline, ...rest }, ref) => (
    <label className={cn('block', inline && INLINE_GRID)}>
      {label && (
        <span
          className={cn(
            'text-sm font-medium text-gray-700',
            !inline && 'mb-1 block',
          )}
        >
          {label}
        </span>
      )}
      {!inline && hint && (
        <p className="mb-1 -mt-0.5 text-xs text-gray-400">{hint}</p>
      )}
      <select
        ref={ref}
        {...rest}
        className={cn(
          'h-11 w-full rounded-lg border bg-white px-3 text-sm outline-none transition',
          'focus:border-primary focus:ring-2 focus:ring-primary-100',
          error ? 'border-red-400' : 'border-gray-300',
          className,
        )}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {inline && hint && (
        <p className={cn('text-xs text-gray-400', INLINE_SUB)}>{hint}</p>
      )}
      {error && (
        <span
          className={cn(
            'block text-xs text-red-500',
            inline ? INLINE_SUB : 'mt-1',
          )}
        >
          {error}
        </span>
      )}
    </label>
  ),
);
SelectField.displayName = 'SelectField';
