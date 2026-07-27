import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  exchangeCode,
  socialRegister,
  socialRegisterRequestCode,
} from '@/shared/api/auth';
import { takeVerifier } from '@/shared/auth/pkce';
import { errorMessage } from '@/shared/api/errorMessage';
import { useAuthStore } from '@/shared/auth/authStore';
import { Button } from '@/shared/ui/Button';
import { TextField } from '@/shared/ui/TextField';
import { AuthCard } from '../components/AuthCard';

type Phase = 'processing' | 'register' | 'error';

const ERROR_MESSAGES: Record<string, string> = {
  email_exists:
    '이미 가입된 이메일입니다. 이메일 로그인 후 마이페이지에서 연동하세요.',
  withdrawn_cooldown: '탈퇴 후 재가입 제한기간입니다. 잠시 후 다시 시도하세요.',
  already_linked_other: '이 소셜 계정은 다른 회원에 이미 연동돼 있습니다.',
  link_requires_login: '연동은 로그인 상태에서만 가능합니다.',
  invalid_account: '유효하지 않은 계정입니다.',
};

/**
 * 소셜 콜백 착지점. 백엔드가 실어 보낸 결과(code/pending/error)를 처리한다.
 *  - code            → 인가코드 교환 → 로그인
 *  - pending(구글)   → 바로 가입 확정
 *  - pending(그 외)  → 이메일 확인 + 코드 인증 후 가입(검증된 이메일만 계정을 소유)
 */
export default function Callback() {
  const navigate = useNavigate();
  const authenticate = useAuthStore((s) => s.authenticate);
  const [phase, setPhase] = useState<Phase>('processing');
  const [message, setMessage] = useState('');

  // pending(register) 상태
  const ticketRef = useRef<string | null>(null);
  const [emailEditable, setEmailEditable] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    // StrictMode 이중 실행 방지(인가코드는 1회용이라 두 번 교환하면 실패한다).
    if (ran.current) return;
    ran.current = true;

    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    const code = params.get('code');
    const pending = params.get('pending');
    const emailRequired = params.get('email_required') === '1';
    const codeRequired = params.get('code_required') === '1';
    const prefillEmail = params.get('email') ?? '';

    const finish = async (
      promise: Promise<Parameters<typeof authenticate>[0]>,
    ) => {
      try {
        await authenticate(await promise);
        navigate('/', { replace: true });
      } catch (e) {
        setPhase('error');
        setMessage(errorMessage(e, '로그인 처리에 실패했습니다.'));
      }
    };

    if (error) {
      setPhase('error');
      setMessage(ERROR_MESSAGES[error] ?? `로그인 실패: ${error}`);
      return;
    }
    if (code) {
      // 이 브라우저가 시작한 흐름의 verifier 를 꺼낸다. 없으면 교환하지 않는다.
      const verifier = takeVerifier();
      if (!verifier) {
        setPhase('error');
        return;
      }
      void finish(exchangeCode(code, verifier));
      return;
    }
    if (pending) {
      // provider 가 이메일을 검증했고(구글) 입력도 필요 없으면 바로 가입 확정.
      if (!emailRequired && !codeRequired) {
        void finish(socialRegister(pending));
        return;
      }
      // 그 외: 이메일 확인 + 코드 인증이 필요하다.
      ticketRef.current = pending;
      setEmail(prefillEmail);
      setEmailEditable(emailRequired);
      setPhase('register');
      return;
    }
    setPhase('error');
    setMessage('잘못된 콜백 요청입니다.');
  }, [authenticate, navigate]);

  const onRequestCode = async () => {
    if (!ticketRef.current) return;
    if (emailEditable && !email.trim()) {
      setMessage('이메일을 입력하세요.');
      return;
    }
    setMessage('');
    setBusy(true);
    try {
      await socialRegisterRequestCode(ticketRef.current, email.trim() || undefined);
      setCodeSent(true);
    } catch (e) {
      setMessage(errorMessage(e, '인증 코드 발송에 실패했습니다.'));
    } finally {
      setBusy(false);
    }
  };

  const onConfirm = async () => {
    if (!ticketRef.current) return;
    if (!code.trim()) {
      setMessage('인증 코드를 입력하세요.');
      return;
    }
    setMessage('');
    setBusy(true);
    try {
      const tokens = await socialRegister(
        ticketRef.current,
        email.trim() || undefined,
        code.trim(),
      );
      await authenticate(tokens);
      navigate('/', { replace: true });
    } catch (e) {
      setMessage(errorMessage(e, '가입에 실패했습니다.'));
    } finally {
      setBusy(false);
    }
  };

  if (phase === 'processing') {
    return (
      <div className="flex h-full items-center justify-center text-gray-400">
        로그인 처리 중…
      </div>
    );
  }

  if (phase === 'register') {
    return (
      <AuthCard
        title="이메일 인증"
        subtitle="가입을 완료하려면 이메일 인증이 필요합니다."
      >
        <div className="space-y-3">
          <TextField
            label="이메일"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={!emailEditable || codeSent}
            hint={
              emailEditable ? undefined : '소셜 계정에서 가져온 이메일입니다.'
            }
          />

          {codeSent && (
            <TextField
              label="인증 코드"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="메일로 받은 6자리 코드"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          )}

          {message && <p className="text-sm text-red-500">{message}</p>}

          {!codeSent ? (
            <Button type="button" loading={busy} onClick={onRequestCode}>
              인증 코드 받기
            </Button>
          ) : (
            <Button type="button" loading={busy} onClick={onConfirm}>
              가입 완료
            </Button>
          )}
        </div>

        {codeSent && (
          <button
            type="button"
            onClick={onRequestCode}
            className="mt-4 block w-full text-center text-sm text-gray-500 hover:underline"
          >
            코드 재발송
          </button>
        )}
      </AuthCard>
    );
  }

  return (
    <AuthCard title="로그인 실패">
      <p className="text-center text-sm text-gray-600">{message}</p>
      <Link
        to="/login"
        className="mt-6 block text-center text-sm font-semibold text-primary hover:underline"
      >
        로그인으로 돌아가기
      </Link>
    </AuthCard>
  );
}
