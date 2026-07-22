import { ApiError } from './client';

/** 백엔드 에러(NestJS { message })를 사람이 읽을 메시지로 변환한다. */
export function errorMessage(err: unknown, fallback = '요청을 처리하지 못했습니다.'): string {
  if (err instanceof ApiError) {
    const body = err.body as { message?: string | string[] } | undefined;
    const msg = body?.message;
    if (Array.isArray(msg)) return msg.join('\n');
    if (typeof msg === 'string') return msg;
    return `${fallback} (HTTP ${err.status})`;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}
