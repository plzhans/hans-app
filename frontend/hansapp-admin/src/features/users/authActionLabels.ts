import type { AuthLogActionType } from '@/shared/api/users';

/**
 * 활동 기록의 이벤트 이름.
 *
 * **순서가 화면의 필터 순서다.** 자주 보는 것(로그인·로그아웃)을 앞에 두고,
 * 계정 생애주기(가입·탈퇴)와 자격증명(비밀번호·이메일·소셜)을 뒤로 묶었다.
 */
export const AUTH_ACTION_ITEMS: { value: AuthLogActionType; label: string }[] = [
  { value: 'LOGIN', label: '로그인' },
  { value: 'LOGOUT', label: '로그아웃' },
  { value: 'SIGNUP', label: '가입' },
  { value: 'WITHDRAW', label: '탈퇴' },
  { value: 'PASSWORD_CHANGE', label: '비밀번호 변경' },
  { value: 'PASSWORD_RESET', label: '비밀번호 재설정' },
  { value: 'EMAIL_VERIFY', label: '이메일 인증' },
  { value: 'OAUTH_LINK', label: '소셜 연동' },
  { value: 'OAUTH_UNLINK', label: '소셜 해제' },
];

export const AUTH_ACTION_LABEL: Record<AuthLogActionType, string> = Object.fromEntries(
  AUTH_ACTION_ITEMS.map((item) => [item.value, item.label]),
) as Record<AuthLogActionType, string>;
