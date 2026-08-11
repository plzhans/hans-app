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
}

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
      <label className="block">
        {label && (
          <span className="mb-1 block text-sm font-medium text-gray-700">
            {label}
          </span>
        )}
        {hint && <p className="mb-1 -mt-0.5 text-xs text-gray-400">{hint}</p>}
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
        {error && (
          <span className="mt-1 block text-xs text-red-500">{error}</span>
        )}
      </label>
    );
  },
);
TextField.displayName = 'TextField';
