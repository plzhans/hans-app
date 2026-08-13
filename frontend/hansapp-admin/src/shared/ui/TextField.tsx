import { forwardRef, useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';

import { cn } from '@/shared/lib/cn';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  /**
   * 눈 버튼으로 잠깐 볼 수 있게 한다. **`type="password"` 일 때만 뜻이 있다.**
   *
   * 하는 일은 `type` 을 바꾸는 것뿐이라 브라우저 API 도 권한도 쓰지 않는다 — http 든
   * 인증서가 이상한 https 든 어디서나 똑같이 동작한다(복사 버튼과 다른 점이다).
   */
  revealable?: boolean;
  /**
   * 열림 상태를 밖에서 쥘 때. **주지 않으면 칸이 스스로 들고 있는다.**
   *
   * 비밀번호와 확인칸처럼 **함께 열려야 하는 짝**이 있을 때 쓴다 — 한쪽만 보이면
   * 서로 맞는지 눈으로 볼 수가 없어 오타를 잡으려고 연 것이 반쪽짜리가 된다.
   */
  revealed?: boolean;
  onRevealedChange?: (revealed: boolean) => void;
  /**
   * 라벨을 위가 아니라 **왼쪽**에 둔다(설명은 칸 아래로 내려간다).
   *
   * 칸이 예닐곱 개 넘게 서는 자리에서 쓴다 — 라벨·설명·칸이 층층이 쌓이면 모달이 화면을
   * 넘겨 스크롤해야 저장 버튼이 나온다. 좁은 화면(sm 미만)에서는 어차피 자리가 없어
   * 원래대로 위아래로 돌아간다.
   */
  inline?: boolean;
}

/** 라벨을 왼쪽에 세울 때 쓰는 격자. 라벨 폭을 한 곳에서 정해 여러 칸이 같은 선에 선다. */
export const INLINE_GRID = 'grid items-center gap-x-4 sm:grid-cols-[7rem_minmax(0,1fr)]';

/** 라벨 아래 칸(설명·오류)이 라벨 칸을 침범하지 않게 둘째 열에 붙인다. */
export const INLINE_SUB = 'mt-1 sm:col-start-2';

/**
 * 라벨·힌트·오류를 묶은 입력.
 *
 * **forwardRef 가 필수다** — react-hook-form 의 register() 는 ref 를 넘겨 값을 읽는다.
 * ref 를 흘리지 않으면 입력은 보이는데 폼이 값을 못 받는다.
 */
export const TextField = forwardRef<HTMLInputElement, Props>(
  (
    {
      label,
      hint,
      error,
      className,
      revealable,
      revealed,
      onRevealedChange,
      inline,
      ...rest
    },
    ref,
  ) => {
    // 밖에서 쥐지 않을 때만 쓰는 값. 둘 중 하나만 실제로 쓰인다.
    const [ownRevealed, setOwnRevealed] = useState(false);
    const open = revealed ?? ownRevealed;

    // 눈 버튼은 가려진 칸에만 붙는다 — 원래 보이는 칸에서는 할 일이 없다.
    const showToggle = revealable && rest.type === 'password';

    /*
      **이메일 칸의 기본값.** iOS 사파리는 첫 글자를 대문자로 바꾸고 자동수정으로 주소를
      건드린다 — `Admin@…` 이 되거나 도메인이 엉뚱한 단어로 갈린다. 칸마다 적는 대신
      여기서 한 번 정한다(어느 이메일 칸에서도 그 동작을 원할 일이 없다).

      `rest` 를 뒤에 펼치므로 부르는 쪽이 명시하면 그쪽이 이긴다.
    */
    const emailDefaults =
      rest.type === 'email'
        ? { autoCapitalize: 'off', autoCorrect: 'off', spellCheck: false }
        : undefined;

    return (
      <label className={cn('block', inline && INLINE_GRID)}>
        {label && (
          <span
            className={cn(
              'text-sm font-medium text-gray-700',
              !inline && 'mb-1 block',
            )}
          >
            {label}
          </span>
        )}
        {/* 위아래 배치일 때만 설명이 칸 앞에 선다. 옆에 세우면 라벨 칸이 좁아 읽히지 않는다. */}
        {!inline && hint && (
          <p className="mb-1 -mt-0.5 text-xs text-gray-400">{hint}</p>
        )}
        <div className="relative">
          <input
            ref={ref}
            {...emailDefaults}
            {...rest}
            type={showToggle && open ? 'text' : rest.type}
            className={cn(
              'h-11 w-full rounded-lg border px-3 text-sm outline-none transition',
              'focus:border-primary focus:ring-2 focus:ring-primary-100',
              error ? 'border-red-400' : 'border-gray-300',
              // 눈 버튼이 앉을 자리를 비운다. 없으면 긴 값이 아이콘 밑으로 들어간다.
              showToggle && 'pr-10',
              className,
            )}
          />
          {showToggle && (
            <button
              type="button"
              // 누를 때 포커스가 입력칸에서 빠져나가지 않게 한다 — 보면서 이어 치는 값이다.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() =>
                onRevealedChange ? onRevealedChange(!open) : setOwnRevealed(!open)
              }
              title={open ? '가리기' : '보기'}
              aria-label={open ? '비밀번호 가리기' : '비밀번호 보기'}
              className="absolute right-0 top-0 grid h-11 w-10 place-items-center text-gray-400 transition hover:text-gray-700"
            >
              {open ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          )}
        </div>
        {inline && hint && (
          <p className={cn('text-xs text-gray-400', INLINE_SUB)}>{hint}</p>
        )}
        {error && (
          <span
            className={cn(
              'block text-xs text-red-500',
              inline ? INLINE_SUB : 'mt-1',
            )}
          >
            {error}
          </span>
        )}
      </label>
    );
  },
);
TextField.displayName = 'TextField';
