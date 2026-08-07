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
    '이미 가입된 이메일입니다. 아래에서 이메일로 로그인한 뒤 마이페이지에서 연동하세요.',
  withdrawn_cooldown: '탈퇴 후 재가입 제한기간입니다. 잠시 후 다시 시도하세요.',
  already_linked_other: '이 소셜 계정은 다른 회원에 이미 연동돼 있습니다.',
  link_requires_login: '연동은 로그인 상태에서만 가능합니다.',
  invalid_account: '유효하지 않은 계정입니다.',
};

/**
 * 사유 코드를 문장으로. 모르는 코드는 코드 그대로 보여준다 —
 * 원인을 감추면 사용자도 우리도 무엇이 일어났는지 알 수 없다.
 */
export function socialErrorMessage(code: string): string {
  return SOCIAL_ERROR_MESSAGES[code] ?? `로그인 실패: ${code}`;
}
