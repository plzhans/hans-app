import { ApiError } from './client';

/** 백엔드 에러(NestJS { message })를 사람이 읽을 메시지로 변환한다. */
export function errorMessage(err: unknown, fallback = '요청을 처리하지 못했습니다.'): string {
  if (err instanceof ApiError) {
    // 발송 상한/쿨다운(인증 코드 429)은 백엔드 메시지가 영어라, 여기서 한국어로 매핑한다.
    if (err.status === 429) {
      return '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';
    }
    const body = err.body as { message?: string | string[] } | undefined;
    const msg = body?.message;
    if (Array.isArray(msg)) return msg.join('\n');
    if (typeof msg === 'string') return msg;
    return `${fallback} (HTTP ${err.status})`;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}
