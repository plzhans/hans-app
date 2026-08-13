/**
 * 소셜 로그인이 실패한 사유(백엔드 `?error=`)를 사람이 읽을 문장으로.
 *
 * **로그인 화면과 콜백 화면이 같은 표를 본다.** 자사 흐름의 실패는 로그인 화면으로
 * 돌아가고(거기서 바로 다시 시도할 수 있어야 하니까), 콜백 화면은 코드 교환·가입 확정처럼
 * 그 화면 안에서 생긴 실패를 맡는다. 표가 둘이면 같은 사유가 두 문장이 된다.
 *
 * **다음에 무엇을 하면 되는지까지 적는다.** "이미 가입된 이메일입니다" 만 있으면 사용자는
 * 막힌 것으로 읽는다 — 이 화면에서 이어 갈 방법이 있다는 것을 문장이 말해 줘야 한다.
 */
const SOCIAL_ERROR_MESSAGES: Record<string, string> = {
  email_exists:
    'This email is already registered. Sign in with your email below, then link this account from your account page.',
  withdrawn_cooldown:
    'This email was withdrawn recently and cannot be used yet. Try again later.',
  already_linked_other:
    'This social account is already linked to another user.',
  link_requires_login: 'You must be signed in to link an account.',
  invalid_account: 'This account is not valid.',
};

/**
 * 사유 코드를 문장으로. 모르는 코드는 코드 그대로 보여준다 —
 * 원인을 감추면 사용자도 우리도 무엇이 일어났는지 알 수 없다.
 */
export function socialErrorMessage(code: string): string {
  return SOCIAL_ERROR_MESSAGES[code] ?? `Sign-in failed: ${code}`;
}
