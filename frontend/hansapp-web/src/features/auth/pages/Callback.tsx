import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { exchangeCode, socialRegister } from '@/shared/api/auth';
import { takeVerifier } from '@/shared/auth/pkce';
import { errorMessage } from '@/shared/api/errorMessage';
import { useAuthStore } from '@/shared/auth/authStore';
import { Button } from '@/shared/ui/Button';
import { TextField } from '@/shared/ui/TextField';
import { AuthCard } from '../components/AuthCard';

type Phase = 'processing' | 'need_email' | 'error';

const ERROR_MESSAGES: Record<string, string> = {
  email_exists: '이미 가입된 이메일입니다. 이메일 로그인 후 마이페이지에서 연동하세요.',
  withdrawn_cooldown: '탈퇴 후 재가입 제한기간입니다. 잠시 후 다시 시도하세요.',
  already_linked_other: '이 소셜 계정은 다른 회원에 이미 연동돼 있습니다.',
  link_requires_login: '연동은 로그인 상태에서만 가능합니다.',
  invalid_account: '유효하지 않은 계정입니다.',
};

export default function Callback() {
  const navigate = useNavigate();
  const authenticate = useAuthStore((s) => s.authenticate);
  const [phase, setPhase] = useState<Phase>('processing');
  const [message, setMessage] = useState('');
  const ticketRef = useRef<string | null>(null);
  const ran = useRef(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ email: string }>();

  useEffect(() => {
    // StrictMode 이중 실행 방지(인가코드는 1회용이라 두 번 교환하면 실패한다).
    if (ran.current) return;
    ran.current = true;

    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    const code = params.get('code');
    const pending = params.get('pending');
    const emailRequired = params.get('email_required') === '1';

    const finish = async (promise: Promise<Parameters<typeof authenticate>[0]>) => {
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
      if (emailRequired) {
        ticketRef.current = pending;
        setPhase('need_email');
        return;
      }
      void finish(socialRegister(pending));
      return;
    }
    setPhase('error');
    setMessage('잘못된 콜백 요청입니다.');
  }, [authenticate, navigate]);

  const onSubmitEmail = handleSubmit(async ({ email }) => {
    if (!ticketRef.current) return;
    try {
      const tokens = await socialRegister(ticketRef.current, email);
      await authenticate(tokens);
      navigate('/', { replace: true });
    } catch (e) {
      setMessage(errorMessage(e, '가입에 실패했습니다.'));
    }
  });

  if (phase === 'processing') {
    return (
      <div className="flex h-full items-center justify-center text-gray-400">
        로그인 처리 중…
      </div>
    );
  }

  if (phase === 'need_email') {
    return (
      <AuthCard title="이메일 입력" subtitle="가입을 완료하려면 이메일이 필요합니다">
        <form onSubmit={onSubmitEmail} className="space-y-3">
          <TextField
            label="이메일"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            error={errors.email?.message}
            {...register('email', { required: '이메일을 입력하세요.' })}
          />
          {message && <p className="text-sm text-red-500">{message}</p>}
          <Button type="submit" loading={isSubmitting}>
            가입 완료
          </Button>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="로그인 실패">
      <p className="text-center text-sm text-gray-600">{message}</p>
      <Link
        to="/auth/login"
        className="mt-6 block text-center text-sm font-semibold text-primary hover:underline"
      >
        로그인으로 돌아가기
      </Link>
    </AuthCard>
  );
}
