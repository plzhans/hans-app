import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

/**
 * 입력 한 줄의 껍데기. **모바일과 PC 에서 모양이 다르다.**
 *
 * 모바일(~lg)은 레이블이 입력칸 **위**에 붙는다 — 폭이 좁아 옆에 두면 입력칸이 남는 게 없다.
 * PC(lg~)는 레이블이 입력칸 **왼쪽**에 붙어 한 줄이 된다. 좁은 화면용 세로 폼을 그대로
 * 늘려 놓으면 넓은 화면에서 눈이 위아래로만 오르내려 읽는 거리가 길어진다.
 *
 * **레이블이 없는 줄도 이걸로 감싼다**(버튼·체크박스·오류 문구 등). 빈 레이블 칸을 그대로
 * 내주므로 입력칸과 왼쪽 끝이 맞는다 — 폭을 직접 적어 맞추면 레이블 칸을 넓힐 때 어긋난다.
 */
const FIELD_LABEL_WIDTH = 'lg:w-32';

export function FieldRow({
  label,
  hint,
  error,
  as: Wrapper = 'label',
  children,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  /**
   * 감싸는 태그. 기본은 label 이라 글자를 눌러도 입력칸이 잡힌다.
   * 스스로 바깥 요소를 가져야 하는 입력(ComboBox)만 div 로 바꾼다.
   */
  as?: 'label' | 'div';
  children: ReactNode;
}) {
  return (
    <Wrapper className="block lg:flex lg:gap-4">
      {label ? (
        <span
          className={cn(
            'mb-1 block text-sm font-medium text-gray-700',
            // 입력칸(lg:h-12) 한가운데에 글자를 맞춘다. **왼쪽 정렬이다** — 오른쪽으로
            // 붙이면 글자 수마다 시작점이 달라져 왼쪽 끝이 들쭉날쭉해진다.
            'lg:mb-0 lg:shrink-0 lg:pt-3.5 lg:text-left',
            FIELD_LABEL_WIDTH,
          )}
        >
          {label}
        </span>
      ) : (
        // 빈 레이블 칸. 모바일에서는 아예 없다(자리를 비워 둘 폭이 없다).
        <span aria-hidden className={cn('hidden lg:block lg:shrink-0', FIELD_LABEL_WIDTH)} />
      )}
      {/* min-w-0 이 없으면 긴 값이 든 입력칸이 레이블 칸을 밀어낸다. */}
      <span className="block lg:min-w-0 lg:flex-1">
        {children}
        {/*
          도움말과 오류는 **입력칸 아래**다. 위에 두면 PC 에서 레이블이 도움말 줄과
          나란해져, 정작 짝인 입력칸과는 어긋난 자리에 앉는다.
        */}
        {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
        {error && (
          <span className="mt-1 block text-xs text-red-500">{error}</span>
        )}
      </span>
    </Wrapper>
  );
}
