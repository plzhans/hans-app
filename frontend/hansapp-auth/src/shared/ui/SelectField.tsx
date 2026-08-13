import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '@/shared/lib/cn';
import { FieldRow } from './FieldRow';

interface Option {
  value: string;
  label: string;
}

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: string;
  error?: string;
  options: readonly Option[];
}

/** TextField 와 짝을 이루는 선택 입력. 높이·테두리·포커스 링을 같은 값으로 맞춘다. */
export const SelectField = forwardRef<HTMLSelectElement, Props>(
  ({ label, hint, error, options, className, ...rest }, ref) => {
    return (
      <FieldRow label={label} hint={hint} error={error}>
        <select
          ref={ref}
          {...rest}
          className={cn(
            'h-11 w-full rounded-lg border bg-white px-3 text-sm outline-none transition lg:h-12 lg:px-4 lg:text-base',
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
      </FieldRow>
    );
  },
);
SelectField.displayName = 'SelectField';
