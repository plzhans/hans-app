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
      // 처리 중에 한 번 더 눌리면 요청이 두 번 나간다.
      disabled={disabled || loading}
      className={cn(
        // **기본이 w-full 이다**(인증웹 Button 과 같다). 폼 안에서 쓰는 일이 대부분이라
        // 그쪽을 기본으로 두고, 툴바처럼 좁게 쓸 때만 className 으로 w-auto 를 준다.
        'inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition',
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
