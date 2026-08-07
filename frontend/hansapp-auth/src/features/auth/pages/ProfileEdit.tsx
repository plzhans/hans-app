import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { updateMyName } from '@/shared/api/auth';
import { errorMessage } from '@/shared/api/errorMessage';
import { useAuthStore } from '@/shared/auth/authStore';
import { Button } from '@/shared/ui/Button';
import { TextField } from '@/shared/ui/TextField';
import { AuthCard } from '../components/AuthCard';

/**
 * 정보 수정 화면. **마이페이지와 페이지를 나눈다.**
 *
 * 마이페이지는 읽는 화면이다 — 계정 정보, 동의 내역, 로그인 기기 목록까지 붙는다.
 * 거기에 입력 폼을 펼쳐 두면 읽는 것과 고치는 것이 한 화면에 섞여 어느 쪽도 잘 안 보인다.
 *
 * [비밀번호는 여기 없다]
 * 화면에서는 나란히 보일 뿐 서버에서는 남남이다 — 엔드포인트가 다르고, 실패 이유가 다르고,
 * 성공 후에 할 일도 다르다. 한 버튼으로 묶으면 "이름은 저장됐는데 비밀번호는 틀렸다" 는
 * 절반 성공을 화면이 떠안고, 그걸 피하려 호출 순서와 되돌리기 규칙이 붙는다.
 * **한 화면은 한 API 만 부른다** — 비밀번호는 PasswordEdit 이 맡는다.
 *
 * [고칠 수 있는 것]
 *  - **이메일은 못 바꾼다.** 계정의 식별자이자 로그인 수단이고, 바꾸려면 새 주소의 소유를
 *    다시 증명해야 한다(인증 코드). 그 흐름이 없으므로 입력칸을 만들지 않는다 —
 *    "바꿀 수 있을 것처럼" 보이는 칸을 두고 막는 것이 더 나쁘다. 대신 값은 보여준다.
 */
export default function ProfileEdit() {
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.me);
  const refreshMe = useAuthStore((s) => s.refreshMe);

  const [name, setName] = useState(me?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!me) return null;

  const nameChanged = name !== (me.name ?? '');

  const save = async () => {
    setError(null);
    setBusy(true);
    try {
      await updateMyName(name);
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

        {error && <p className="text-sm text-red-500">{error}</p>}

        {/* 바꾼 게 없으면 저장할 것도 없다. */}
        <Button
          type="button"
          loading={busy}
          disabled={!nameChanged}
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
