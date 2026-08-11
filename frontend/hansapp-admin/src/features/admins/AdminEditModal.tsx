import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  updateAdmin,
  type AdminAccountDetail,
  type AdminRole,
} from '@/shared/api/admins';
import { errorMessage } from '@/shared/api/errorMessage';
import { useAuthStore } from '@/shared/auth/authStore';
import { assignableRoles } from '@/shared/lib/adminRoles';
import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Modal';
import { SelectField } from '@/shared/ui/SelectField';
import { TextField } from '@/shared/ui/TextField';

/**
 * 관리자 정보 수정.
 *
 * **이메일까지 고칠 수 있다.** 로그인 식별자라 조심스러운 값이지만, 담당자 주소는 실제로
 * 바뀐다(부서 이동·도메인 교체) — 그때마다 계정을 새로 만들어 옮기면 그 사람이 남긴
 * 기록과의 연결이 끊긴다.
 *
 * **안 만진 항목은 요청에 담지 않는다.** 통째로 보내면 화면이 들고 있던 옛 값이 다른
 * 곳에서 방금 바뀐 값을 덮는다.
 */
export function AdminEditModal({
  admin,
  onClose,
}: {
  admin: AdminAccountDetail;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.me);
  const refreshMe = useAuthStore((s) => s.refreshMe);
  const isMe = admin.id === me?.id;

  const [email, setEmail] = useState(admin.email);
  const [name, setName] = useState(admin.name ?? '');
  const [role, setRole] = useState<AdminRole>(admin.role);

  /*
    **지금 등급도 목록에 남긴다.** 내가 내줄 수 없는 등급이어도 그렇다 — 여기 오는 것은
    내가 다룰 수 있는 계정뿐이라(같은 등급까지) 지금 값은 언제나 목록에 있지만,
    빠지는 순간 선택이 빈칸이 되고 저장하면 엉뚱한 등급으로 덮인다.
  */
  const roles = assignableRoles(me?.role);
  const roleOptions = roles.some((item) => item.value === admin.role)
    ? roles
    : [
        ...roles,
        { value: admin.role, label: admin.role, description: '' },
      ];

  const emailChanged = email.trim().toLowerCase() !== admin.email;
  const nameChanged = name.trim() !== (admin.name ?? '');
  const roleChanged = role !== admin.role;
  const changed = emailChanged || nameChanged || roleChanged;

  const save = useMutation({
    mutationFn: () =>
      updateAdmin(admin.id, {
        ...(emailChanged ? { email: email.trim() } : {}),
        ...(nameChanged ? { name: name.trim() } : {}),
        ...(roleChanged ? { role } : {}),
      }),
    onSuccess: async (updated) => {
      // 응답이 갱신된 상세다 — 다시 받아오지 않고 그대로 캐시에 꽂는다.
      qc.setQueryData(['admin', admin.id], updated);
      // 목록은 이메일·이름 칸이 바뀌므로 다음에 열 때 새로 받게 한다.
      void qc.invalidateQueries({ queryKey: ['admins'] });
      /*
        고친 것이 나였다면 상단바·내정보가 아직 옛 이메일을 들고 있다.
        **여기서 실패해도 저장은 이미 끝난 일이라** 모달을 닫는 것까지 막지 않는다.
      */
      if (isMe) {
        await refreshMe().catch(() => undefined);
      }
      onClose();
    },
  });

  return (
    <Modal size="md" title="관리자 수정" onClose={onClose}>
      <div className="space-y-4">
        <TextField
          label="이메일"
          hint="로그인 식별자입니다. 바꾸면 옛 주소로는 로그인할 수 없습니다."
          type="email"
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        {/*
          **바꾼 순간에만 경고한다.** 늘 띄워 두면 이름만 고치러 온 사람에게도 붉은 글씨가
          보여서, 정작 이메일을 고칠 때 눈에 안 들어온다.
        */}
        {emailChanged && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            {isMe
              ? '지금 로그인은 그대로 유지되지만, 다음 로그인부터는 새 주소를 써야 합니다.'
              : '이 관리자에게 바뀐 주소를 알려 주세요. 로그인 중이라면 끊기지 않지만, 다음 로그인부터는 새 주소를 써야 합니다.'}
          </p>
        )}

        <TextField
          label="이름"
          hint="목록에서 사람을 알아보기 위한 표시 이름입니다. 비우면 지워집니다."
          autoComplete="off"
          placeholder="홍길동"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <SelectField
          label="등급"
          hint={
            roleOptions.find((item) => item.value === role)?.description ||
            '자기보다 높은 등급으로는 바꿀 수 없습니다.'
          }
          options={roleOptions.map((item) => ({
            value: item.value,
            label: item.label,
          }))}
          value={role}
          onChange={(e) => setRole(e.target.value as AdminRole)}
        />

        {/* 등급을 내리면 그 계정이 갑자기 못 하는 일이 생긴다. 저장 전에 말해 준다. */}
        {roleChanged && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            {isMe
              ? '본인 등급을 바꿉니다. 낮추면 지금 하던 일 중 일부를 더 이상 할 수 없습니다.'
              : '이 관리자가 다룰 수 있는 계정의 범위가 바뀝니다.'}
          </p>
        )}

        {/* 여기서 못 고치는 값들. 어디로 가야 하는지 적어 두지 않으면 이 창을 다시 연다. */}
        <p className="border-t border-gray-100 pt-3 text-xs text-gray-400">
          언어·시간대는 본인만 바꿀 수 있습니다(내정보). 비밀번호는 상세의 초기화로
          다시 냅니다.
        </p>
      </div>

      {save.error != null && (
        <p className="mt-3 whitespace-pre-line text-sm text-red-500">
          {errorMessage(save.error, '저장하지 못했습니다.')}
        </p>
      )}

      <div className="mt-5 flex items-center gap-2 border-t border-gray-100 pt-4">
        <Button
          type="button"
          className="w-auto px-4"
          loading={save.isPending}
          disabled={!changed || email.trim().length === 0}
          onClick={() => save.mutate()}
        >
          저장
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-auto px-4"
          disabled={save.isPending}
          onClick={onClose}
        >
          취소
        </Button>
      </div>
    </Modal>
  );
}
