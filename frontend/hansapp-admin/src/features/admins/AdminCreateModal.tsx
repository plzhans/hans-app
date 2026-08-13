import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  createAdmin,
  type AdminCreated,
  type AdminRole,
} from '@/shared/api/admins';
import { errorMessage } from '@/shared/api/errorMessage';
import { useAuthStore } from '@/shared/auth/authStore';
import { assignableRoles } from '@/shared/lib/adminRoles';
import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Modal';
import { SelectField } from '@/shared/ui/SelectField';
import { TextField } from '@/shared/ui/TextField';
import {
  CheckboxField,
  MAIL_FAIL_MESSAGE,
  PasswordFields,
  SecretBox,
  passwordReady,
} from './PasswordFields';

/**
 * 관리자 추가.
 *
 * **비밀번호를 화면에서 정해 보낸다.** 직접 적든 임의로 만들든, 만든 사람이 그 값을 아는
 * 채로 끝난다 — 메일을 못 보내는 환경에서도 건네줄 값이 손에 남아야 한다.
 */
export function AdminCreateModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();

  const myRole = useAuthStore((s) => s.me?.role);
  /**
   * 내가 내줄 수 있는 등급만 고를 수 있다. **막는 것은 서버지만**, 고를 수 없는 값을
   * 늘어놓고 403 으로 답하는 것보다 목록에서 빼는 편이 낫다.
   */
  const roles = assignableRoles(myRole);

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  /** **가장 낮은 등급이 기본이다.** 무심코 넘긴 값이 권한을 더 주는 쪽이면 안 된다. */
  const [role, setRole] = useState<AdminRole>('OPERATOR');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [sendEmail, setSendEmail] = useState(true);

  /**
   * 만들어졌지만 **메일이 나가지 않은** 계정.
   *
   * 이때만 모달을 붙잡아 둔다 — 보내겠다고 해 놓고 안 나갔으면 비밀번호를 사람이 직접
   * 건네야 하는데, 창이 닫히면 그 값이 화면에서 사라진다.
   */
  const [undelivered, setUndelivered] = useState<AdminCreated>();

  const done = () => {
    void qc.invalidateQueries({ queryKey: ['admins'] });
    onClose();
  };

  const submit = useMutation({
    mutationFn: () =>
      createAdmin({
        email: email.trim(),
        name: name.trim() || undefined,
        role,
        password,
        sendEmail,
      }),
    onSuccess: (result) => {
      if (sendEmail && !result.emailSent) {
        setUndelivered(result);
        void qc.invalidateQueries({ queryKey: ['admins'] });
        return;
      }
      done();
    },
  });

  if (undelivered) {
    return (
      <Modal size="md" title="계정은 만들어졌습니다" onClose={done}>
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          안내 메일이 나가지 않았습니다.{' '}
          {undelivered.emailFailReason
            ? MAIL_FAIL_MESSAGE[undelivered.emailFailReason]
            : ''}
        </p>

        <p className="mt-4 text-sm text-gray-600">
          <b className="text-gray-900">{undelivered.account.email}</b> 계정의
          비밀번호를 직접 전달하세요.
        </p>
        <SecretBox value={password} />

        <p className="mt-3 text-xs text-gray-400">
          본인이 첫 로그인에서 비밀번호를 바꾸기 전까지는 다른 화면을 열 수
          없습니다.
        </p>

        <div className="mt-5 border-t border-gray-100 pt-4">
          <Button type="button" className="w-auto px-4" onClick={done}>
            확인했습니다
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal size="md" title="관리자 추가" onClose={onClose}>
      {/*
        **칸마다 설명을 달지 않는다.** 이메일·이름·등급은 이름만 보고 아는 값이라, 한 줄씩
        붙이면 창이 화면을 넘겨 저장 버튼이 스크롤 아래로 간다(수정 창과 같은 규칙).
      */}
      <div className="space-y-4">
        <TextField
          inline
          label="이메일"
          type="email"
          autoComplete="off"
          placeholder="admin@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <TextField
          inline
          label="이름"
          autoComplete="off"
          // 비워도 된다는 사실은 placeholder 로 충분하다.
          placeholder="홍길동"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <SelectField
          inline
          label="등급"
          options={roles.map((item) => ({
            value: item.value,
            label: item.label,
          }))}
          value={role}
          onChange={(e) => setRole(e.target.value as AdminRole)}
        />

        <PasswordFields
          label="패스워드"
          password={password}
          confirm={confirm}
          onPassword={setPassword}
          onConfirm={setConfirm}
        />

        <div className="border-t border-gray-100 pt-3">
          <CheckboxField
            label="사용자에게 알림 이메일 보내기"
            checked={sendEmail}
            onChange={setSendEmail}
          />
        </div>
      </div>

      {submit.error != null && (
        <p className="mt-3 whitespace-pre-line text-sm text-red-500">
          {errorMessage(submit.error, '관리자를 추가하지 못했습니다.')}
        </p>
      )}

      <div className="mt-5 flex items-center gap-2 border-t border-gray-100 pt-4">
        <Button
          type="button"
          className="w-auto px-4"
          loading={submit.isPending}
          disabled={
            email.trim().length === 0 || !passwordReady(password, confirm)
          }
          onClick={() => submit.mutate()}
        >
          추가
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-auto px-4"
          disabled={submit.isPending}
          onClick={onClose}
        >
          취소
        </Button>
      </div>
    </Modal>
  );
}
