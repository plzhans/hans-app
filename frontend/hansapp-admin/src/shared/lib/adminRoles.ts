import type { AdminRole } from '@/shared/api/admins';

/**
 * 등급의 이름과 서열. **서버(admin-role.ts)와 같은 값을 들고 있다.**
 *
 * 화면이 서열을 아는 이유는 막기 위해서가 아니라(막는 것은 서버다) **못 하는 일을 보여
 * 주지 않기 위해서다** — 누를 수 없는 버튼을 띄워 놓고 403 으로 답하는 것보다,
 * 처음부터 고를 수 없게 두는 편이 낫다.
 */
export const ADMIN_ROLE_ITEMS: {
  value: AdminRole;
  label: string;
  description: string;
}[] = [
  {
    value: 'SYSTEM',
    label: '시스템 관리자',
    description: '모든 등급의 계정을 만들고 고칠 수 있습니다.',
  },
  {
    value: 'ADMIN',
    label: '일반 관리자',
    description: '일반 관리자와 운영자 계정을 다룹니다.',
  },
  {
    value: 'OPERATOR',
    label: '운영자',
    description: '운영자 계정만 다룹니다.',
  },
];

export const ADMIN_ROLE_LABEL: Record<AdminRole, string> = Object.fromEntries(
  ADMIN_ROLE_ITEMS.map((item) => [item.value, item.label]),
) as Record<AdminRole, string>;

/** 서열. **작을수록 높다**(서버 ADMIN_ROLE_RANK 와 같은 값). */
const RANK: Record<AdminRole, number> = {
  SYSTEM: 10,
  ADMIN: 20,
  OPERATOR: 30,
};

/** 등급 뱃지 색. 높을수록 눈에 띄게 — 목록에서 시스템 관리자가 몇인지가 먼저 보여야 한다. */
export const ADMIN_ROLE_TONE: Record<AdminRole, 'red' | 'blue' | 'gray'> = {
  SYSTEM: 'red',
  ADMIN: 'blue',
  OPERATOR: 'gray',
};

/**
 * `actor` 가 `target` 등급의 계정을 다룰 수 있는가. **자기보다 위는 못 건드린다.**
 *
 * 내 등급을 아직 모르면(부팅 중) 다룰 수 없는 것으로 본다 — 잠깐 보였다 사라지는
 * 버튼보다 잠깐 안 보이는 편이 낫다.
 */
export function canManageRole(
  actor: AdminRole | undefined,
  target: AdminRole,
): boolean {
  return !!actor && RANK[target] >= RANK[actor];
}

/** 내가 내줄 수 있는 등급들. 계정을 만들거나 등급을 고칠 때 고를 수 있는 목록이다. */
export function assignableRoles(actor: AdminRole | undefined) {
  return ADMIN_ROLE_ITEMS.filter((item) => canManageRole(actor, item.value));
}
