import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  emailSignup,
  relayCodeIfNeeded,
  requestSignupCode,
} from '@/shared/api/auth';
import { errorMessage } from '@/shared/api/errorMessage';
import { useAuthStore } from '@/shared/auth/authStore';
import { Button } from '@/shared/ui/Button';
import { TextField } from '@/shared/ui/TextField';
import { AuthCard } from '../components/AuthCard';

interface Form {
  email: string;
  password: string;
  passwordConfirm: string;
  name: string;
}

/** SSO 릴레이 파라미터(return_to·client_id)를 보존해 링크를 만든다. 하나라도 빠지면 귀속이 끊긴다. */
function relayLink(
  path: string,
  returnTo?: string,
  clientId?: string,
  codeChallenge?: string,
  clientState?: string,
): string {
  if (!returnTo) return path;
  const params = new URLSearchParams({ redirect_uri: returnTo });
  if (clientId) params.set('client_id', clientId);
  if (codeChallenge) params.set('code_challenge', codeChallenge);
  if (clientState) params.set('state', clientState);
  return `${path}?${params.toString()}`;
}

/**
 * 이메일 회원가입. **가입 전에 이메일을 인증**한다(검증된 이메일만 계정을 소유).
 *   1) form — 이메일/비번/이름 입력 → 인증 코드 발송(계정은 아직 안 만듦)
 *   2) code — 메일로 받은 코드 입력 → 검증되면 계정 생성 + 로그인
 */
export default function Signup() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnTo = params.get('redirect_uri') ?? undefined;
  const clientId = params.get('client_id') ?? undefined;
  const codeChallenge = params.get('code_challenge') ?? undefined;
  const clientState = params.get('state') ?? undefined;
  const authenticate = useAuthStore((s) => s.authenticate);

  const [step, setStep] = useState<'form' | 'code'>('form');
  const [account, setAccount] = useState<Form | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<Form>();

  // 1단계: 입력값 검증 후 코드 발송, 코드 입력 단계로.
  const onRequest = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await requestSignupCode(values.email);
      setAccount(values);
      setStep('code');
    } catch (e) {
      setServerError(errorMessage(e, '인증 코드 발송에 실패했습니다.'));
    }
  });

  // 2단계: 코드로 가입 확정 → 로그인.
  const onConfirm = async () => {
    if (!account) return;
    if (!code.trim()) {
      setCodeError('인증 코드를 입력하세요.');
      return;
    }
    setCodeError(null);
    setServerError(null);
    setSubmitting(true);
    try {
      const tokens = await emailSignup(
        account.email,
        account.password,
        account.name,
        code.trim(),
      );
      await authenticate(tokens);
      if (
        !(await relayCodeIfNeeded(returnTo, clientId, codeChallenge, clientState))
      ) {
        navigate('/', { replace: true });
      }
    } catch (e) {
      setServerError(errorMessage(e, '회원가입에 실패했습니다.'));
    } finally {
      setSubmitting(false);
    }
  };

  const resendCode = async () => {
    if (!account) return;
    setServerError(null);
    try {
      await requestSignupCode(account.email);
    } catch (e) {
      setServerError(errorMessage(e, '인증 코드 재발송에 실패했습니다.'));
    }
  };

  if (step === 'code' && account) {
    return (
      <AuthCard
        title="이메일 인증"
        subtitle={`${account.email} 로 보낸 인증 코드를 입력하세요.`}
      >
        <div className="space-y-3">
          <TextField
            label="인증 코드"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="메일로 받은 6자리 코드"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            error={codeError ?? undefined}
          />
          {serverError && (
            <p className="whitespace-pre-line text-sm text-red-500">
              {serverError}
            </p>
          )}
          <Button type="button" loading={submitting} onClick={onConfirm}>
            가입 완료
          </Button>
        </div>

        <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
          <button
            type="button"
            onClick={() => {
              setStep('form');
              setCode('');
              setCodeError(null);
              setServerError(null);
            }}
            className="hover:underline"
          >
            이메일 다시 입력
          </button>
          <button type="button" onClick={resendCode} className="hover:underline">
            코드 재발송
          </button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="회원가입" subtitle="이메일로 HansApp 계정 만들기">
      <form onSubmit={onRequest} className="space-y-3">
        <TextField
          label="이메일"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          error={errors.email?.message}
          {...register('email', { required: '이메일을 입력하세요.' })}
        />
        <TextField
          label="비밀번호"
          type="password"
          autoComplete="new-password"
          placeholder="8자 이상"
          error={errors.password?.message}
          {...register('password', {
            required: '비밀번호를 입력하세요.',
            minLength: {
              value: 8,
              message: '비밀번호는 8자 이상이어야 합니다.',
            },
          })}
        />
        <TextField
          label="비밀번호 확인"
          type="password"
          autoComplete="new-password"
          placeholder="비밀번호를 한 번 더 입력하세요"
          error={errors.passwordConfirm?.message}
          {...register('passwordConfirm', {
            required: '비밀번호를 한 번 더 입력하세요.',
            validate: (v) =>
              v === getValues('password') || '비밀번호가 일치하지 않습니다.',
          })}
        />
        <TextField
          label="이름"
          type="text"
          autoComplete="name"
          placeholder="홍길동"
          error={errors.name?.message}
          {...register('name', { required: '이름을 입력하세요.' })}
        />
        {serverError && (
          <p className="whitespace-pre-line text-sm text-red-500">
            {serverError}
          </p>
        )}
        <Button type="submit" loading={isSubmitting}>
          인증 코드 받기
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        이미 계정이 있으신가요?{' '}
        <Link
          to={relayLink('/auth/login', returnTo, clientId, codeChallenge, clientState)}
          className="font-semibold text-primary hover:underline"
        >
          로그인
        </Link>
      </p>
    </AuthCard>
  );
}
