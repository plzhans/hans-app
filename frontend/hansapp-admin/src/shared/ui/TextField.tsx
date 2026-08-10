import { forwardRef, type InputHTMLAttributes } from 'react';

import { cn } from '@/shared/lib/cn';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

/**
 * 라벨·힌트·오류를 묶은 입력.
 *
 * **forwardRef 가 필수다** — react-hook-form 의 register() 는 ref 를 넘겨 값을 읽는다.
 * ref 를 흘리지 않으면 입력은 보이는데 폼이 값을 못 받는다.
 */
export const TextField = forwardRef<HTMLInputElement, Props>(
  ({ label, hint, error, className, ...rest }, ref) => (
    <label className="block">
      {label && (
        <span className="mb-1 block text-sm font-medium text-gray-700">
          {label}
        </span>
      )}
      {hint && <p className="mb-1 -mt-0.5 text-xs text-gray-400">{hint}</p>}
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
  ),
);
TextField.displayName = 'TextField';
