import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { updateUser, type UserDetail } from '@/shared/api/users';
import { errorMessage } from '@/shared/api/errorMessage';
import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Modal';
import { TextField } from '@/shared/ui/TextField';

/**
 * 회원 정보 수정.
 *
 * **고칠 수 있는 것은 표시 이름뿐이다.** 관리자 계정 수정과 달리 이메일 칸이 없다 —
 *
 *  - 이메일은 로그인 식별자다. 관리자 계정은 담당자 주소가 실제로 바뀌어서(부서 이동·도메인
 *    교체) 열어 뒀지만, 회원 이메일을 남이 바꾸면 그 계정의 주인이 바뀌는 일이 된다.
 *  - 이메일 인증 여부는 "우리가 확인했다" 는 사실의 기록이라, 손으로 켜면 기록이 거짓이 된다.
 *  - 언어·시간대는 본인의 표시 취향이라 남이 정할 값이 아니다.
 *
 * 그래서 나머지는 아래에 **읽기 전용으로 보여만 준다** — 고치러 온 사람이 "왜 여기엔 없지"
 * 를 묻지 않게, 값과 함께 못 고치는 이유를 같은 자리에 둔다.
 *
 * **안 만진 항목은 요청에 담지 않는다.** 통째로 보내면 화면이 들고 있던 옛 값이 다른 곳에서
 * 방금 바뀐 값을 덮는다(관리자 수정과 같은 규칙).
 */
export function UserEditModal({
  user,
  onClose,
}: {
  user: UserDetail;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(user.name ?? '');

  const changed = name.trim() !== (user.name ?? '');

  const save = useMutation({
    mutationFn: () => updateUser(user.id, { name: name.trim() }),
    onSuccess: () => {
      // 서버가 204 라 돌려받는 것이 없다. 상세·목록 모두 다시 받는다.
      void qc.invalidateQueries({ queryKey: ['user', user.id] });
      void qc.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
  });

  return (
    <Modal size="md" title="회원 수정" onClose={onClose}>
      <div className="space-y-4">
        <TextField
          label="이름"
          hint="목록에서 사람을 알아보기 위한 표시 이름입니다. 비우면 지워집니다."
          autoComplete="off"
          placeholder="홍길동"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <dl className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm">
          <ReadOnly label="이메일" value={user.email}>
            로그인 식별자라 바꾸지 않습니다.
          </ReadOnly>
          <ReadOnly
            label="이메일 인증"
            value={user.emailVerified ? '인증됨' : '미인증'}
          >
            회원 본인이 인증해야 바뀝니다.
          </ReadOnly>
          <ReadOnly label="등급" value={user.tier}>
            앱 생성 한도를 정하는 값이라 따로 다룹니다.
          </ReadOnly>
        </dl>

        {save.error != null && (
          <p className="whitespace-pre-line text-sm text-red-500">
            {errorMessage(save.error, '회원 정보를 저장하지 못했습니다.')}
          </p>
        )}
      </div>

      <div className="mt-5 flex items-center gap-2 border-t border-gray-100 pt-4">
        <Button
          type="button"
          className="w-auto px-4"
          loading={save.isPending}
          // 바뀐 것이 없으면 누를 이유가 없다. 빈 요청을 보내면 서버도 그냥 넘긴다.
          disabled={!changed}
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

/** 못 고치는 값. **왜 못 고치는지를 값 바로 아래 둔다.** */
function ReadOnly({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: string;
}) {
  return (
    <div className="flex gap-3">
      <dt className="w-20 shrink-0 pt-0.5 text-gray-400">{label}</dt>
      <dd className="min-w-0 flex-1">
        <span className="block break-all text-gray-700">{value}</span>
        <span className="mt-0.5 block text-xs text-gray-400">{children}</span>
      </dd>
    </div>
  );
}
