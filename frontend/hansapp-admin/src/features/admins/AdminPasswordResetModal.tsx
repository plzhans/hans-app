import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  resetAdminPassword,
  type AdminAccountDetail,
  type AdminMailFailReason,
} from '@/shared/api/admins';
import { errorMessage } from '@/shared/api/errorMessage';
import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Modal';
import {
  MAIL_FAIL_MESSAGE,
  PasswordFields,
  SecretBox,
  SendEmailCheckbox,
  passwordReady,
} from './PasswordFields';

/**
 * 비밀번호 초기화.
 *
 * **본인이 값을 잃어버렸을 때 다른 관리자가 다시 내주는 통로다.** 콘솔에 못 들어오는
 * 사람이라 스스로 할 수 있는 것이 없다 — 그래서 현재 비밀번호를 묻지 않는다.
 *
 * 대신 뒤처리가 무겁다: 그 계정의 세션이 전부 끊기고, 본인이 첫 로그인에서 다시 바꿔야 한다.
 * 눌러 놓고 몰랐다는 말이 나오지 않게 두 가지를 창에서 미리 말해 둔다.
 */
export function AdminPasswordResetModal({
  admin,
  onClose,
}: {
  admin: AdminAccountDetail;
  onClose: () => void;
}) {
  const qc = useQueryClient();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [sendEmail, setSendEmail] = useState(true);
  /**
   * 바뀌었지만 **메일이 나가지 않았다.** 이때만 창을 붙잡아 둔다 — 값을 잃어버린 사람에게
   * 닿을 통로가 메일뿐이었는데 그게 실패했으면, 이 화면이 값을 넘길 마지막 자리다.
   */
  const [undelivered, setUndelivered] = useState<AdminMailFailReason | null>();

  const done = () => {
    // 세션 수가 0으로 떨어진다(전부 끊었다). 상세를 다시 받아 그 값을 맞춘다.
    void qc.invalidateQueries({ queryKey: ['admin', admin.id] });
    void qc.invalidateQueries({ queryKey: ['admins'] });
    onClose();
  };

  const submit = useMutation({
    mutationFn: () => resetAdminPassword(admin.id, { password, sendEmail }),
    onSuccess: (result) => {
      if (sendEmail && !result.emailSent) {
        setUndelivered(result.emailFailReason ?? null);
        return;
      }
      done();
    },
  });

  if (undelivered !== undefined) {
    return (
      <Modal size="md" title="비밀번호는 바뀌었습니다" onClose={done}>
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          안내 메일이 나가지 않았습니다.{' '}
          {undelivered ? MAIL_FAIL_MESSAGE[undelivered] : ''}
        </p>

        <p className="mt-4 text-sm text-gray-600">
          <b className="text-gray-900">{admin.email}</b> 님에게 새 비밀번호를
          직접 전달하세요.
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
    <Modal size="md" title="비밀번호 초기화" onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
          <span className="font-mono text-xs text-gray-400">#{admin.id}</span>
          <span className="ml-2 font-semibold text-gray-900">
            {admin.email}
          </span>
          {admin.name && (
            <span className="ml-2 text-gray-500">{admin.name}</span>
          )}
        </div>

        <p className="text-sm text-gray-600">
          이 관리자의 비밀번호를 새 값으로 바꿉니다.{' '}
          <b className="text-gray-900">
            로그인 중인 세션({admin.activeSessionCount}개)이 모두 끊기고
          </b>
          , 본인이 첫 로그인에서 비밀번호를 다시 바꿔야 합니다.
        </p>

        <PasswordFields
          label="새 패스워드"
          password={password}
          confirm={confirm}
          onPassword={setPassword}
          onConfirm={setConfirm}
        />

        <SendEmailCheckbox
          label="사용자에게 이메일 보내기"
          checked={sendEmail}
          onChange={setSendEmail}
          hint="새 비밀번호를 본인에게 보냅니다. 메일 설정(설정 > 메일)이 켜져 있어야 나갑니다."
        />
      </div>

      {submit.error != null && (
        <p className="mt-3 whitespace-pre-line text-sm text-red-500">
          {errorMessage(submit.error, '비밀번호를 바꾸지 못했습니다.')}
        </p>
      )}

      <div className="mt-5 flex items-center gap-2 border-t border-gray-100 pt-4">
        <Button
          type="button"
          className="w-auto px-4"
          loading={submit.isPending}
          disabled={!passwordReady(password, confirm)}
          onClick={() => submit.mutate()}
        >
          초기화
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
