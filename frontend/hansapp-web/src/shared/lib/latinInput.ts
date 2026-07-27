import type { ChangeEvent, CompositionEvent } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';

/** 영문 대소문자와 하이픈(-)만 남긴다. */
export const stripNonLatin = (s: string): string => s.replace(/[^a-zA-Z-]/g, '');

/**
 * react-hook-form register 를 감싸 **영문 전용 입력**으로 만든다.
 * 핵심: IME **조합 중(isComposing)에는 값을 건드리지 않는다**(건드리면 조합이 깨져 글자가 씹힘).
 * 영문 입력(조합 아님)은 즉시 정리하고, 한글 등은 조합이 끝나는 순간 제거한다.
 */
export function latinRegister(reg: UseFormRegisterReturn): UseFormRegisterReturn {
  return {
    ...reg,
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      if (!(e.nativeEvent as InputEvent).isComposing) {
        e.target.value = stripNonLatin(e.target.value);
      }
      return reg.onChange(e);
    },
    onCompositionEnd: (e: CompositionEvent<HTMLInputElement>) => {
      e.currentTarget.value = stripNonLatin(e.currentTarget.value);
      void reg.onChange(
        e as unknown as ChangeEvent<HTMLInputElement>,
      );
    },
    // onChange 시그니처가 rhf 타입과 정확히 겹치지 않아 unknown 경유로 단언한다(런타임 동작은 동일).
  } as unknown as UseFormRegisterReturn;
}
