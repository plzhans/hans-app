import { useState } from 'react';
import { withdraw } from '@/shared/api/auth';
import { errorMessage } from '@/shared/api/errorMessage';
import { useAuthStore } from '@/shared/auth/authStore';
import { Button } from '@/shared/ui/Button';

/**
 * 회원 탈퇴. **개인정보처리방침 제10조가 약속한 "삭제" 를 이행하는 자리다.**
 *
 * [접어 둔다]
 * 마이페이지에 처음부터 펼쳐 두지 않는다. 계정을 보러 온 사람에게 탈퇴 버튼이 먼저 보이면
 * 잘못 누를 여지만 생긴다. 한 번 열어야 내용이 나오고, 거기서 다시 눌러야 실행된다.
 *
 * [무슨 일이 생기는지 먼저 적는다]
 * 문구는 지어내지 않고 **HansApp 계정 이용약관 제11조와 개인정보처리방침 제3조에 적힌 그대로**다.
 * 화면이 문서보다 관대하게 말하면(예: "언제든 되돌릴 수 있다") 그 순간 문서가 거짓이 된다.
 *
 * [30일은 되돌리기 기간이 아니다]
 * 탈퇴하면 계정은 바로 막힌다. 30일은 **같은 이메일로 곧바로 다시 가입하는 것을 막는 기간**이고,
 * 그 기간이 지나면 남은 기록(이메일·이름)까지 지워진다. 복구 기간으로 오해하지 않게 적는다.
 */
export function WithdrawSection() {
  const signOut = useAuthStore((s) => s.signOut);
  const [open, setOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onWithdraw = async () => {
    setError(null);
    setBusy(true);
    try {
      await withdraw();
      /*
        서버가 세션을 폐기하고 쿠키를 지웠지만 **이 오리진의 저장소는 남아 있다**.
        signOut 이 토큰·프로필 캐시를 치우고 다른 탭에도 알린다. 그러면 라우터가
        비로그인 상태를 보고 로그인 화면으로 내려놓는다.
      */
      await signOut();
    } catch (e) {
      setError(errorMessage(e, '탈퇴 처리에 실패했습니다.'));
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-6 block w-full text-center text-xs text-gray-400 hover:text-gray-600 hover:underline"
      >
        회원 탈퇴
      </button>
    );
  }

  return (
    <section className="mt-6 rounded-lg border border-red-200 bg-red-50/50 p-4">
      <h2 className="text-sm font-bold text-gray-900">회원 탈퇴</h2>

      <ul className="mt-2 space-y-1 pl-4 text-xs leading-relaxed text-gray-600">
        <li className="-indent-4 pl-4">
          · 이 계정으로 이용하던 <strong>모든 서비스를 더 이상 이용할 수 없습니다.</strong>
        </li>
        <li className="-indent-4 pl-4">
          · 각 서비스에 남긴 자료의 처리는 그 서비스의 약관에서 정합니다.
        </li>
        <li className="-indent-4 pl-4">
          · 같은 이메일로는 <strong>30일 동안 다시 가입할 수 없습니다.</strong> 그 기간이
          지나면 남은 기록(이메일·이름)까지 완전히 삭제됩니다.
        </li>
        <li className="-indent-4 pl-4">· 탈퇴는 되돌릴 수 없습니다.</li>
      </ul>

      <label className="mt-3 flex items-start gap-2 text-xs text-gray-700">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-red-600"
        />
        <span>위 내용을 확인했으며 탈퇴에 동의합니다.</span>
      </label>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      <div className="mt-4 flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setOpen(false);
            setAgreed(false);
            setError(null);
          }}
        >
          취소
        </Button>
        {/* 동의 전에는 누를 수 없다. 되돌릴 수 없는 동작이라 한 단계 더 세운다. */}
        <Button
          type="button"
          loading={busy}
          disabled={!agreed}
          onClick={() => void onWithdraw()}
        >
          탈퇴하기
        </Button>
      </div>
    </section>
  );
}
