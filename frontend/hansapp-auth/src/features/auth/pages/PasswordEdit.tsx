import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { updatePassword } from '@/shared/api/auth';
import { errorMessage } from '@/shared/api/errorMessage';
import { useAuthStore } from '@/shared/auth/authStore';
import { Button } from '@/shared/ui/Button';
import { TextField } from '@/shared/ui/TextField';
import { AuthCard } from '../components/AuthCard';

/**
 * 비밀번호 화면. **정보 수정과 한 폼에 섞지 않는다.**
 *
 * 이름 바꾸기와 비밀번호 바꾸기는 화면에서 나란히 보일 뿐 서버에서는 남남이다 —
 * 엔드포인트가 다르고, 실패 이유가 다르고(이름은 형식, 비밀번호는 자격증명), 성공 후에
 * 할 일도 다르다. 한 버튼으로 묶으면 "이름은 저장됐는데 비밀번호는 틀렸다" 같은 절반
 * 성공을 화면이 떠안게 되고, 그걸 피하려 순서를 정하고 되돌리는 규칙이 붙는다.
 * **자리를 나누면 그 복잡함이 통째로 사라진다** — 한 화면은 한 API 만 부른다.
 *
 * [설정과 변경]
 * 소셜로만 가입한 계정은 비밀번호가 없어 현재 비밀번호를 물을 것이 없다(`hasPassword`).
 * 그때는 '설정' 이고, 로그인 상태 자체가 신원 증명이라 새 값만 받는다.
 */
export default function PasswordEdit() {
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.me);
  const refreshMe = useAuthStore((s) => s.refreshMe);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!me) return null;

  // 비밀번호가 없는 계정은 '변경'이 아니라 '설정'이다.
  const settingNew = !me.hasPassword;
  const filled =
    (settingNew || !!currentPassword) && !!newPassword && !!confirmPassword;

  const save = async () => {
    setError(null);

    if (newPassword.length < 8) {
      setError('비밀번호는 8자 이상이어야 합니다.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    setBusy(true);
    try {
      // 설정이면 현재 비밀번호를 아예 안 보낸다 — 서버가 계정 상태로 판정한다.
      await updatePassword({
        currentPassword: settingNew ? undefined : currentPassword,
        newPassword,
      });
      // hasPassword 가 바뀐다 — 소셜 연동 해제 가능 여부가 여기에 걸려 있다.
      await refreshMe();
      navigate('/me', { replace: true });
    } catch (e) {
      setError(
        errorMessage(
          e,
          settingNew
            ? '비밀번호를 설정하지 못했습니다.'
            : '비밀번호를 변경하지 못했습니다.',
        ),
      );
      setBusy(false);
    }
  };

  return (
    <AuthCard
      title={settingNew ? '비밀번호 설정' : '비밀번호 변경'}
      subtitle={
        settingNew
          ? '설정하면 소셜 로그인 없이 이메일로도 로그인할 수 있습니다'
          : 'HansApp 계정의 비밀번호를 바꿉니다'
      }
    >
      <div className="space-y-3">
        {/* 없는 비밀번호를 물을 수는 없다. 소셜 전용 계정에는 이 칸만 뺀다. */}
        {!settingNew && (
          <TextField
            label="현재 비밀번호"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        )}
        <TextField
          label={settingNew ? '비밀번호' : '새 비밀번호'}
          type="password"
          autoComplete="new-password"
          placeholder="8자 이상"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <TextField
          label={settingNew ? '비밀번호 확인' : '새 비밀번호 확인'}
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />

        {error && <p className="text-sm text-red-500">{error}</p>}

        <Button
          type="button"
          loading={busy}
          disabled={!filled}
          onClick={() => void save()}
        >
          {settingNew ? '설정' : '변경'}
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
