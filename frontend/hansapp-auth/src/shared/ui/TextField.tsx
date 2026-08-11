import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/shared/lib/cn';
import { FieldRow } from './FieldRow';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

export const TextField = forwardRef<HTMLInputElement, Props>(
  ({ label, hint, error, className, ...rest }, ref) => {
    return (
      <FieldRow label={label} hint={hint} error={error}>
        <input
          ref={ref}
          {...rest}
          className={cn(
            // PC 에서 한 치수 커진다 — 넓은 화면에서 모바일 크기 그대로면 폼이 작아 보인다.
            'h-11 w-full rounded-lg border px-3 text-sm outline-none transition lg:h-12 lg:px-4 lg:text-base',
            'focus:border-primary focus:ring-2 focus:ring-primary-100',
            error ? 'border-red-400' : 'border-gray-300',
            className,
          )}
        />
      </FieldRow>
    );
  },
);
TextField.displayName = 'TextField';
