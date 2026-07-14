import { useCallback, useEffect, useRef, useState } from 'react';
import { copyToClipboard } from '@/shared/lib/clipboard';

/**
 * 클립보드 복사 + "복사됨" 피드백 상태를 관리하는 훅.
 * copied 에는 마지막으로 복사한 텍스트가 담기므로(잠시 후 null),
 * 복사 버튼이 여러 개일 때 어떤 값이 복사됐는지 구분할 수 있다.
 *
 * @param resetMs 복사됨 상태 유지 시간(ms)
 */
export function useCopyToClipboard(resetMs = 1500) {
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback(
    async (text: string) => {
      const ok = await copyToClipboard(text);
      if (ok) {
        setCopied(text);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(null), resetMs);
      }
      return ok;
    },
    [resetMs],
  );

  return { copy, copied };
}
