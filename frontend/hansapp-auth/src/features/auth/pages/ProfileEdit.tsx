import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { changePassword, updateMyName } from '@/shared/api/auth';
import { errorMessage } from '@/shared/api/errorMessage';
import { useAuthStore } from '@/shared/auth/authStore';
import { Button } from '@/shared/ui/Button';
import { TextField } from '@/shared/ui/TextField';
import { AuthCard } from '../components/AuthCard';

/**
 * 정보 수정 화면. **마이페이지와 페이지를 나눈다.**
 *
 * 마이페이지는 읽는 화면이다 — 계정 정보, 동의 내역, 그리고 곧 로그인 기기 목록까지 붙는다.
 * 거기에 입력 폼을 펼쳐 두면 읽는 것과 고치는 것이 한 화면에 섞여 어느 쪽도 잘 안 보인다.
 *
 * [한 폼, 한 버튼]
 * 항목마다 저장 버튼을 두지 않는다. 이름을 고치고 비밀번호도 바꾸려던 사람이 두 번 저장하고
 * 두 번 결과를 확인해야 하는데, 사용자에게 그건 한 가지 일이다. **[저장] 하나로 끝내고
 * 마이페이지로 돌려보낸다** — 저장했는데 같은 화면에 남으면 됐는지 안 됐는지가 흐릿하다.
 *
 * [고칠 수 있는 것]
 *  - **이메일은 못 바꾼다.** 계정의 식별자이자 로그인 수단이고, 바꾸려면 새 주소의 소유를
 *    다시 증명해야 한다(인증 코드). 그 흐름이 없으므로 입력칸을 만들지 않는다 —
 *    "바꿀 수 있을 것처럼" 보이는 칸을 두고 막는 것이 더 나쁘다. 대신 값은 보여준다.
 *  - **비밀번호는 있는 계정만.** 소셜로만 가입하면 비밀번호가 없어 현재 비밀번호를 물을 수
 *    없다(`hasPassword`). 그런 계정에는 아예 띄우지 않는다.
 */
export default function ProfileEdit() {
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.me);
  const refreshMe = useAuthStore((s) => s.refreshMe);

  const [name, setName] = useState(me?.name ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!me) return null;

  const nameChanged = name !== (me.name ?? '');
  // 비밀번호 칸을 하나라도 건드렸으면 바꾸려는 것으로 본다. 셋 다 비면 손대지 않는다.
  const wantsPasswordChange = !!(
    currentPassword ||
    newPassword ||
    confirmPassword
  );
  const changed = nameChanged || wantsPasswordChange;

  const save = async () => {
    setError(null);

    if (wantsPasswordChange) {
      if (!currentPassword) {
        setError('현재 비밀번호를 입력하세요.');
        return;
      }
      if (newPassword.length < 8) {
        setError('새 비밀번호는 8자 이상이어야 합니다.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setError('새 비밀번호가 일치하지 않습니다.');
        return;
      }
    }

    setBusy(true);
    try {
      /*
        **비밀번호를 먼저 바꾼다.** 실패할 가능성이 가장 큰 쪽이라(현재 비밀번호가 틀리면
        서버가 거절한다) 여기서 끊으면 이름은 손대지 않은 채로 남는다. 반대로 두면
        "이름은 저장됐는데 비밀번호는 안 됐다" 는 어정쩡한 상태가 흔해진다.
      */
      if (wantsPasswordChange) {
        await changePassword(currentPassword, newPassword);
      }
      if (nameChanged) {
        await updateMyName(name);
      }
      await refreshMe();
      navigate('/me', { replace: true });
    } catch (e) {
      setError(errorMessage(e, '저장하지 못했습니다.'));
      setBusy(false);
    }
  };

  return (
    <AuthCard title="정보 수정" subtitle="HansApp 계정 정보를 고칩니다">
      <div className="space-y-3">
        {/* 못 바꾸는 값이라 입력칸이 아니라 읽는 줄로 둔다. */}
        <div className="rounded-lg bg-gray-50 p-3 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-gray-500">이메일</span>
            <span className="font-medium text-gray-900">{me.email}</span>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            이메일은 계정을 식별하는 값이라 변경할 수 없습니다.
          </p>
        </div>

        <TextField
          label="이름"
          type="text"
          autoComplete="name"
          placeholder="비워 두면 이름을 지웁니다"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        {me.hasPassword && (
          <div className="space-y-3 border-t border-gray-200 pt-4">
            <div>
              <h2 className="text-xs font-bold text-gray-700">비밀번호 변경</h2>
              <p className="mt-0.5 text-xs text-gray-400">
                비워 두면 비밀번호를 바꾸지 않습니다.
              </p>
            </div>
            <TextField
              label="현재 비밀번호"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
            <TextField
              label="새 비밀번호"
              type="password"
              autoComplete="new-password"
              placeholder="8자 이상"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <TextField
              label="새 비밀번호 확인"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}

        {/* 바꾼 게 없으면 저장할 것도 없다. */}
        <Button
          type="button"
          loading={busy}
          disabled={!changed}
          onClick={() => void save()}
        >
          저장
        </Button>
      </div>

      <button
        type="button"
        onClick={() => navigate('/me')}
        className="mt-6 block w-full text-center text-sm text-gray-500 hover:underline"
      >
        취소
      </button>
    </AuthCard>
  );
}
