import { cn } from '@/shared/lib/cn';

type Tone = 'green' | 'gray' | 'amber' | 'red' | 'blue';

const TONES: Record<Tone, string> = {
  green: 'bg-green-50 text-green-700 ring-green-600/20',
  gray: 'bg-gray-50 text-gray-600 ring-gray-500/20',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  blue: 'bg-blue-50 text-blue-700 ring-blue-600/20',
};

export function Badge({
  tone = 'gray',
  children,
  className,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
