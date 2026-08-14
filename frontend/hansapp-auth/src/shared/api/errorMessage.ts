import { ApiError } from './client';

/**
 * 백엔드가 영어로 던지는 예외 문구를 한국어로 옮긴다.
 *
 * **서버 메시지는 영어로 둔다** — API 를 직접 쓰는 쪽에는 그게 맞고, 화면 문구는 화면이
 * 정할 일이다. 그래서 옮기는 자리를 여기 하나로 모은다.
 *
 * 문구를 키로 쓰는 것은 서버가 코드를 따로 주지 않기 때문이다. 서버에서 문장을 바꾸면
 * 여기도 함께 고쳐야 한다(안 고치면 영어가 그대로 보인다 — 조용히 깨지지는 않는다).
 *
 * **사유만 적지 않고 다음에 할 일까지 적는다.** "이미 가입된 이메일입니다" 로 끝나면
 * 사용자는 막힌 것으로 읽는다.
 */
const SERVER_MESSAGES: Record<string, string> = {
  'Email already registered.':
    '이미 가입된 이메일입니다.\n다른 이메일을 입력하거나, 그 이메일로 로그인한 뒤 마이페이지에서 이 소셜 계정을 연동해 주세요.',
  'Invalid or expired verification code.':
    '인증 코드가 맞지 않거나 시간이 지났습니다. 코드를 다시 받아 주세요.',
  'Verification code is required.': '메일로 받은 인증 코드를 입력해 주세요.',
  'Email is required.': '이메일을 입력해 주세요.',
  'Social account already linked.':
    '이미 연동이 끝난 소셜 계정입니다. 로그인 화면에서 다시 시도해 주세요.',
  'Email is already in use.': '이미 사용 중인 이메일입니다.',
};

/** 백엔드 에러(NestJS { message })를 사람이 읽을 메시지로 변환한다. */
export function errorMessage(err: unknown, fallback = '요청을 처리하지 못했습니다.'): string {
  if (err instanceof ApiError) {
    // 발송 상한/쿨다운(인증 코드 429)은 백엔드 메시지가 영어라, 여기서 한국어로 매핑한다.
    if (err.status === 429) {
      return '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';
    }
    const body = err.body as { message?: string | string[] } | undefined;
    const msg = body?.message;
    if (Array.isArray(msg)) return msg.map(translate).join('\n');
    if (typeof msg === 'string') return translate(msg);
    return `${fallback} (HTTP ${err.status})`;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

/** 아는 문구면 한국어로, 모르면 그대로. 감추는 것보다 낯선 문장이 낫다. */
function translate(message: string): string {
  return SERVER_MESSAGES[message.trim()] ?? message;
}
