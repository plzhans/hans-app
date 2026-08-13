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
  CheckboxField,
  MAIL_FAIL_MESSAGE,
  PasswordFields,
  SecretBox,
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
   * 열려 있던 세션을 끊을지. **꺼 놓고 연다.**
   *
   * 이 창을 여는 대부분은 "본인이 값을 잊어버렸다" 이고, 그 사람은 지금 콘솔에서 일하고
   * 있을 수 있다 — 기본으로 끊으면 비밀번호를 내주면서 하던 일을 같이 끊는 셈이다.
   * 유출이 의심될 때 켠다.
   */
  const [revokeSessions, setRevokeSessions] = useState(false);
  /**
   * 첫 로그인에서 비밀번호를 다시 바꾸게 할지. **켠 채로 연다.**
   *
   * 남이 정해 준 값이 그대로 남으면 그 값을 아는 사람이 둘이 된다. 끄는 것은 본인과 함께
   * 앉아 값을 정한 경우다.
   */
  const [mustChange, setMustChange] = useState(true);
  /**
   * 바뀌었지만 **메일이 나가지 않았다.** 이때만 창을 붙잡아 둔다 — 값을 잃어버린 사람에게
   * 닿을 통로가 메일뿐이었는데 그게 실패했으면, 이 화면이 값을 넘길 마지막 자리다.
   */
  const [undelivered, setUndelivered] = useState<AdminMailFailReason | null>();

  const done = () => {
    /*
      끊었다면 세션이 0으로 떨어지고 그 캐시 칸도 사라진다. 상세·기기·캐시를 다시 받아
      맞춘다 — 안 끊었어도 다시 받는 비용이 얼마 안 되고, 어느 쪽인지 분기하면 한쪽만
      고쳐지는 날이 온다.
    */
    void qc.invalidateQueries({ queryKey: ['admin', admin.id] });
    void qc.invalidateQueries({ queryKey: ['admin-sessions', admin.id] });
    void qc.invalidateQueries({ queryKey: ['admin-cache', admin.id] });
    void qc.invalidateQueries({ queryKey: ['admins'] });
    onClose();
  };

  const submit = useMutation({
    mutationFn: () =>
      resetAdminPassword(admin.id, {
        password,
        sendEmail,
        revokeSessions,
        mustChangePassword: mustChange,
      }),
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

        {/* 강제 변경을 꺼 놓고 초기화했으면 이 문장은 사실이 아니다. */}
        {mustChange && (
          <p className="mt-3 text-xs text-gray-400">
            본인이 첫 로그인에서 비밀번호를 바꾸기 전까지는 다른 화면을 열 수
            없습니다.
          </p>
        )}

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

        {/*
          **무엇을 하는 창인지 다시 적지 않는다.** 제목이 "비밀번호 초기화" 이고 바로 위에
          대상 계정이 있어, 한 줄 더 두면 읽히지 않는 문장이 자리만 차지한다.
        */}
        <PasswordFields
          label="새 패스워드"
          password={password}
          confirm={confirm}
          onPassword={setPassword}
          onConfirm={setConfirm}
        />

        {/*
          **세 가지를 켜고 끄는 것으로 묻는다.** 무엇을 하는 항목인지는 이름만으로 아는
          값이라 줄마다 설명을 달지 않는다 — 셋을 붙여 두면 이 창에서 정할 것이 한눈에 든다.

          **켜져 있는 것부터, 그 계정을 세게 건드리는 것이 아래로 간다.** 마지막 줄이 하던
          일을 끊는 항목이라, 그것만 꺼져 있으면 눈이 거기서 한 번 멈춘다.
        */}
        <div className="space-y-2 border-t border-gray-100 pt-3">
          <CheckboxField
            label="사용자에게 알림 이메일 보내기"
            checked={sendEmail}
            onChange={setSendEmail}
          />

          <CheckboxField
            label="다음 로그인에서 비밀번호 변경 강제"
            checked={mustChange}
            onChange={setMustChange}
          />

          <CheckboxField
            label="로그인 중인 세션 끊기"
            checked={revokeSessions}
            onChange={setRevokeSessions}
          />
        </div>
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
