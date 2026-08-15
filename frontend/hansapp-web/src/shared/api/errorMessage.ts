import { ApiError } from './client';
import { ErrorCode } from '@hansapp/api-error';

/** 번호별 한국어 안내. 여기 없는 번호는 아래 status 단계로 떨어진다. */
const MESSAGES: Record<number, string> = {
  /*
    **429 두 개를 갈라 준다.** 둘은 기다리는 시간이 다르다 — 쿨다운은 몇 초지만 시간당
    상한은 한참이다. 같은 말로 안내하면 상한에 걸린 사람이 몇 초마다 다시 눌러 본다.
  */
  [ErrorCode.AUTH_VERIFICATION_EMAIL_RATE_LIMITED]:
    '인증 메일을 너무 많이 보냈습니다. 한 시간 뒤에 다시 시도해 주세요.',
  [ErrorCode.AUTH_VERIFICATION_RESEND_TOO_SOON]:
    '방금 코드를 보냈습니다. 잠시 뒤에 다시 요청해 주세요.',
};

/**
 * 백엔드 오류를 사람이 읽을 한 줄로 바꾼다.
 *
 * **좁은 것부터 본다** — errorCode(사유) → status(계열) → 서버 문구. status 를 먼저 가르면
 * 케이스마다 번호 검사를 또 넣게 되고 같은 문구가 여러 갈래에 복사된다.
 *
 * status 와 errorCode 는 정하는 것이 다르다. **status 는 동작**(재시도할까·다시 로그인할까),
 * **errorCode 는 문구**(사용자에게 뭐라고 말할까)다. 여기는 문구를 정하는 자리라 번호가 먼저다.
 */
export function errorMessage(err: unknown, fallback = '요청을 처리하지 못했습니다.'): string {
  if (!(err instanceof ApiError)) {
    return err instanceof Error ? err.message : fallback;
  }

  const body = err.body as { errorCode?: number; message?: string | string[] } | undefined;

  // 1. 번호로 아는 문구
  const known = body?.errorCode !== undefined ? MESSAGES[body.errorCode] : undefined;
  if (known) return known;

  // 2. 입력값 검증 실패는 필드마다 한 줄씩 배열로 온다. 합치면 어느 항목인지 잃는다.
  const msg = body?.message;
  if (Array.isArray(msg)) return msg.join('\n');

  // 3. 번호를 아직 안 옮긴 것들 — status 로 뭉뚱그려 안내한다.
  if (err.status === 429) return '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';

  // 4. 그래도 없으면 서버 문구 그대로. 감추는 것보다 낯선 문장이 낫다.
  if (typeof msg === 'string') return msg;
  return `${fallback} (HTTP ${err.status})`;
}
