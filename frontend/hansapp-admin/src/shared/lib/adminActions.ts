import type { AdminLogActionType } from '@/shared/api/admins';

/**
 * 관리자 기록의 종류 이름.
 *
 * **순서가 화면의 필터 순서다.** 인증(로그인·로그아웃·비밀번호 변경)을 앞에 두고,
 * 남의 계정을 건드리는 관리 조치를 뒤로 묶었다 — 앞은 자주 보고, 뒤는 되짚을 때 본다.
 */
export const ADMIN_ACTION_ITEMS: {
  value: AdminLogActionType;
  label: string;
}[] = [
  { value: 'LOGIN', label: '로그인' },
  { value: 'LOGOUT', label: '로그아웃' },
  { value: 'PASSWORD_CHANGE', label: '비밀번호 변경' },
  { value: 'ADMIN_CREATE', label: '계정 생성' },
  { value: 'ADMIN_UPDATE', label: '계정 수정' },
  { value: 'ADMIN_DELETE', label: '계정 삭제' },
  { value: 'ADMIN_PASSWORD_RESET', label: '비밀번호 초기화' },
  // 로그인 화면의 "비밀번호 찾기". 남이 해 준 초기화와 갈라 둔다 — 되짚을 때 묻는 것이 다르다.
  { value: 'PASSWORD_RESET_REQUEST', label: '재설정 메일 요청' },
  { value: 'PASSWORD_RESET', label: '재설정 완료' },
];

export const ADMIN_ACTION_LABEL: Record<AdminLogActionType, string> =
  Object.fromEntries(
    ADMIN_ACTION_ITEMS.map((item) => [item.value, item.label]),
  ) as Record<AdminLogActionType, string>;

/**
 * 남의 계정을 건드리는 조치인가.
 *
 * 표가 "대상" 칸을 보여 줄지 정하는 데 쓴다 — 로그인·로그아웃은 자기 자신에게 한 일이라
 * 대상을 적으면 같은 번호가 두 칸에 겹쳐 나온다.
 */
export function isManagementAction(action: AdminLogActionType): boolean {
  return action.startsWith('ADMIN_');
}
