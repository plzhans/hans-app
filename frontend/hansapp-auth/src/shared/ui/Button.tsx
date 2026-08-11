import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/shared/lib/cn';

type Variant = 'primary' | 'outline';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        // 입력칸과 같은 치수로 움직인다(TextField 참고) — 둘 중 하나만 커지면 줄이 어긋난다.
        'inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition lg:h-12 lg:text-base',
        'disabled:cursor-not-allowed disabled:opacity-60',
        variant === 'primary' && 'bg-primary text-white hover:bg-primary-700',
        variant === 'outline' &&
          'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
        className,
      )}
    >
      {loading ? '처리 중…' : children}
    </button>
  );
}
