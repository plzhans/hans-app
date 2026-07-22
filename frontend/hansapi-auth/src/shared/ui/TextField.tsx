import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/shared/lib/cn';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export const TextField = forwardRef<HTMLInputElement, Props>(
  ({ label, error, className, ...rest }, ref) => {
    return (
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">
          {label}
        </span>
        <input
          ref={ref}
          {...rest}
          className={cn(
            'h-11 w-full rounded-lg border px-3 text-sm outline-none transition',
            'focus:border-primary focus:ring-2 focus:ring-primary-100',
            error ? 'border-red-400' : 'border-gray-300',
            className,
          )}
        />
        {error && <span className="mt-1 block text-xs text-red-500">{error}</span>}
      </label>
    );
  },
);
TextField.displayName = 'TextField';
