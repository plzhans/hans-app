import type { UserStatus } from '@/shared/api/users';

/** 계정 상태의 표시 색과 한국어 이름. 목록·상세가 같은 값을 쓴다. */
export const STATUS_LABEL: Record<UserStatus, string> = {
  ACTIVE: '활성',
  SUSPENDED: '정지',
  WITHDRAWN: '탈퇴',
};

export const STATUS_TONE: Record<UserStatus, 'green' | 'amber' | 'gray'> = {
  ACTIVE: 'green',
  SUSPENDED: 'amber',
  WITHDRAWN: 'gray',
};
