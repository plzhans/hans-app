import { type InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/shared/lib/utils';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-11 w-full rounded-field bg-surface px-4 text-sm text-ink outline-none',
        /*
          테두리를 border 가 아니라 ring 으로 그린다. **초점이 갔을 때 높이가 안 변해서다** —
          border 를 굵히면 그만큼 안쪽이 줄어 글자가 1px 씩 들썩인다.
        */
        'ring-1 ring-inset ring-line',
        'placeholder:text-ink-subtle focus:ring-2 focus:ring-brand',
        className,
      )}
      {...props}
    />
  ),
);

Input.displayName = 'Input';
