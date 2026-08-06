import { useState } from 'react';
import { changePassword, updateMyName } from '@/shared/api/auth';
import { errorMessage } from '@/shared/api/errorMessage';
import { useAuthStore } from '@/shared/auth/authStore';
import { Button } from '@/shared/ui/Button';
import { TextField } from '@/shared/ui/TextField';

/**
 * 정보 수정. **개인정보처리방침 제10조가 약속한 "정정" 을 이행하는 자리다.**
 *
 * 고칠 수 있는 것은 표시 이름과 비밀번호뿐이다.
 *  - **이메일은 못 바꾼다.** 계정의 식별자이자 로그인 수단이고, 바꾸려면 새 주소의 소유를
 *    다시 증명해야 한다(인증 코드). 지금은 그 흐름이 없으므로 화면에도 만들지 않는다 —
 *    "바꿀 수 있을 것처럼" 보이는 입력칸을 두고 막는 것이 더 나쁘다.
 *  - **비밀번호는 있는 계정만.** 소셜로만 가입하면 비밀번호가 없어서 현재 비밀번호를 물을 수
 *    없다(`hasPassword`). 그런 계정에는 아예 띄우지 않는다.
 *
 * 저장 후에는 서버에서 다시 읽는다(`refreshMe`). 화면이 입력값을 그대로 반영하면 서버가
 * 다듬은 결과(앞뒤 공백 제거, 빈 이름 → 없음)와 어긋난다.
 */
export function ProfileSection() {
  const me = useAuthStore((s) => s.me);
  const refreshMe = useAuthStore((s) => s.refreshMe);
  const [open, setOpen] = useState(false);

  if (!me) return null;

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        정보 수정
      </Button>
    );
  }

  return (
    <section className="mt-4 rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-900">정보 수정</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-gray-400 hover:text-gray-700"
        >
          닫기
        </button>
      </div>

      <NameForm current={me.name ?? ''} onSaved={refreshMe} />
      {me.hasPassword && <PasswordForm />}
    </section>
  );
}

/** 표시 이름. 빈 값으로 저장하면 이름을 지운다(서버가 null 로 남긴다). */
function NameForm({
  current,
  onSaved,
}: {
  current: string;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(current);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      await updateMyName(name);
      await onSaved();
      setMessage('이름을 저장했습니다.');
    } catch (e) {
      setError(errorMessage(e, '이름을 저장하지 못했습니다.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 space-y-2">
      <TextField
        label="이름"
        type="text"
        autoComplete="name"
        placeholder="비워 두면 이름을 지웁니다"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      {message && <p className="text-xs text-gray-500">{message}</p>}
      {/* 바꾼 게 없으면 누를 이유가 없다. 눌러도 같은 값을 다시 저장할 뿐이다. */}
      <Button
        type="button"
        loading={busy}
        disabled={name === current}
        onClick={() => void save()}
      >
        이름 저장
      </Button>
    </div>
  );
}

/** 비밀번호 변경. 현재 비밀번호를 함께 보내야 한다(도용 계정이 비밀번호를 못 바꾸게). */
function PasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    setMessage(null);
    if (next.length < 8) {
      setError('새 비밀번호는 8자 이상이어야 합니다.');
      return;
    }
    if (next !== confirm) {
      setError('새 비밀번호가 일치하지 않습니다.');
      return;
    }
    setBusy(true);
    try {
      await changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      setMessage('비밀번호를 변경했습니다.');
    } catch (e) {
      setError(errorMessage(e, '비밀번호를 변경하지 못했습니다.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-6 space-y-2 border-t border-gray-200 pt-4">
      <h3 className="text-xs font-bold text-gray-700">비밀번호 변경</h3>
      <TextField
        label="현재 비밀번호"
        type="password"
        autoComplete="current-password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
      />
      <TextField
        label="새 비밀번호"
        type="password"
        autoComplete="new-password"
        placeholder="8자 이상"
        value={next}
        onChange={(e) => setNext(e.target.value)}
      />
      <TextField
        label="새 비밀번호 확인"
        type="password"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      {message && <p className="text-xs text-gray-500">{message}</p>}
      <Button
        type="button"
        loading={busy}
        disabled={!current || !next || !confirm}
        onClick={() => void save()}
      >
        비밀번호 변경
      </Button>
    </div>
  );
}
