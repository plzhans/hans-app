import { useState } from 'react';
import { changePassword, updateMyName } from '@/shared/api/auth';
import { errorMessage } from '@/shared/api/errorMessage';
import { Button } from '@/shared/ui/Button';
import { TextField } from '@/shared/ui/TextField';

/**
 * 정보 수정 폼 조각. 화면(ProfileEdit)과 분리해 둔 이유는 **저장 성공·실패 문구가 폼마다
 * 따로 살아야** 하기 때문이다 — 이름을 저장한 뒤 비밀번호 폼에 "저장했습니다" 가 남으면 안 된다.
 */

/** 표시 이름. 빈 값으로 저장하면 이름을 지운다(서버가 null 로 남긴다). */
export function NameForm({
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
export function PasswordForm() {
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
