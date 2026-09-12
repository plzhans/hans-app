import { Check, Copy } from 'lucide-react';
import { useCopyToClipboard } from '@/shared/hooks/useCopyToClipboard';
import { cn } from '@/shared/lib/utils';

/**
 * 라벨 + 값 블록 + 복사 버튼. 값을 코드 블록으로 보여주고 클릭 한 번에 복사한다.
 * 복사 로직은 useCopyToClipboard(→ copyToClipboard, http 폴백 포함)를 쓴다.
 */
export function CopyField({
  label,
  value,
  className,
}: {
  label?: string;
  value: string;
  className?: string;
}) {
  const { copy, copied } = useCopyToClipboard();
  const isCopied = copied === value;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {label && <span className="w-14 shrink-0 text-xs text-ink-subtle">{label}</span>}
      <code className="min-w-0 flex-1 truncate rounded-lg bg-surface-subtle px-2.5 py-1.5 font-mono text-xs text-ink-body">
        {value}
      </code>
      <button
        type="button"
        onClick={() => void copy(value)}
        aria-label="copy"
        className={cn(
          'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors',
          isCopied
            ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
            : 'border-line text-ink-muted hover:bg-surface-subtle hover:text-ink-body',
        )}
      >
        {isCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
