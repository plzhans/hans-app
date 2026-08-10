import { ApiError } from '@/shared/api/client';

/**
 * 에러를 화면에 보여줄 한 줄로 바꾼다.
 *
 * 백엔드 예외 메시지는 영어다(백엔드 규칙). 사용자에게 그대로 보여도 되는 것만 그대로 쓰고,
 * 상태 코드로 뜻이 분명한 것은 한국어로 갈아 끼운다.
 */
export function errorMessage(
  err: unknown,
  fallback = '요청을 처리하지 못했습니다.',
): string {
  if (err instanceof ApiError) {
    if (err.status === 429) {
      return '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';
    }
    if (err.status === 401) {
      return '이메일 또는 비밀번호가 올바르지 않습니다.';
    }
    const body = err.body as { message?: string | string[] } | undefined;
    const msg = body?.message;
    // class-validator 는 필드마다 한 줄씩 배열로 준다.
    if (Array.isArray(msg)) return msg.join('\n');
    if (typeof msg === 'string') return msg;
    return `${fallback} (HTTP ${err.status})`;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}
