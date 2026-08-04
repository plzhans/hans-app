import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/shared/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variants: Record<Variant, string> = {
  // 채운 버튼만 색 그림자를 진다 — 바닥에서 떠 보여야 "주 행동" 으로 읽힌다.
  primary:
    'bg-brand text-white shadow-brand-sm active:bg-brand-strong disabled:bg-brand/40 disabled:shadow-none',
  secondary:
    'bg-surface text-ink ring-1 ring-inset ring-line active:bg-surface-subtle',
  ghost: 'bg-transparent text-ink-muted active:bg-surface-subtle',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-field font-bold disabled:cursor-not-allowed',
        /*
          눌림. **손을 뗀 뒤에도 잠깐 따라오는 곡선(ease-native)** 이라야 앱의 버튼처럼 느껴진다.
          hover 가 아니라 active 를 쓰는 이유는 주 사용처가 손가락이라서다 — 터치 기기에서
          hover 는 누른 뒤 그대로 남아, 눌린 채로 굳은 것처럼 보인다.
        */
        'transition-all duration-100 ease-native active:scale-[0.97]',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  ),
);

Button.displayName = 'Button';
