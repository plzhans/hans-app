import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { emailLogin } from '@/shared/api/auth';
import { errorMessage } from '@/shared/api/errorMessage';
import { goAfterLogin, readAfterLoginParams } from '@/shared/auth/afterLogin';
import { useAuthStore } from '@/shared/auth/authStore';
import { Button } from '@/shared/ui/Button';
import { TextField } from '@/shared/ui/TextField';
import { AuthCard } from '../components/AuthCard';
import { SocialButtons } from '../components/SocialButtons';

interface Form {
  email: string;
  password: string;
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

export default function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // 복귀 관련 쿼리(redirect_uri·client_id·code_challenge·state·return)를 한 덩어리로 읽는다.
  const after = readAfterLoginParams(params);
  const { returnTo, clientId, codeChallenge, clientState, appReturn } = after;
  const authenticate = useAuthStore((s) => s.authenticate);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>();

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setServerError(null);
    try {
      const tokens = await emailLogin(email, password);
      await authenticate(tokens);
      // 복귀 규칙은 goAfterLogin 한 곳에 있다 — 이미 로그인한 채로 /login 에 온 경우
      // (App 의 GuestOnly)와 **같은 판정**이어야 해서 공유한다.
      if (await goAfterLogin(after)) return;
      navigate('/me', { replace: true });
    } catch (e) {
      setServerError(errorMessage(e, '로그인에 실패했습니다.'));
    }
  });

  return (
    <AuthCard title="로그인" subtitle="HansApp 계정으로 로그인하기">
      <form onSubmit={onSubmit} className="space-y-3">
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
          autoComplete="current-password"
          placeholder="••••••••"
          error={errors.password?.message}
          {...register('password', { required: '비밀번호를 입력하세요.' })}
        />
        <div className="text-right">
          <Link
            to={relayLink(
              '/forgot-password',
              returnTo,
              clientId,
              codeChallenge,
              clientState,
            )}
            className="text-sm text-gray-500 hover:text-primary hover:underline"
          >
            비밀번호를 잊으셨나요?
          </Link>
        </div>
        {serverError && (
          <p className="whitespace-pre-line text-sm text-red-500">{serverError}</p>
        )}
        <Button type="submit" loading={isSubmitting}>
          로그인
        </Button>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs text-gray-400">
        <span className="h-px flex-1 bg-gray-200" />
        또는
        <span className="h-px flex-1 bg-gray-200" />
      </div>
      <SocialButtons
        returnTo={returnTo}
        clientId={clientId}
        codeChallenge={codeChallenge}
        clientState={clientState}
        appReturn={appReturn}
      />

      <p className="mt-6 text-center text-sm text-gray-500">
        계정이 없으신가요?{' '}
        <Link
          to={
            relayLink('/signup', returnTo, clientId, codeChallenge, clientState)
          }
          className="font-semibold text-primary hover:underline"
        >
          회원가입
        </Link>
      </p>
    </AuthCard>
  );
}
