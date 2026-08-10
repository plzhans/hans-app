import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** tailwind 클래스 결합. 뒤에 온 것이 앞의 같은 계열을 덮는다(twMerge). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
