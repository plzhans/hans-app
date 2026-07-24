import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { emailLogin, relayCodeIfNeeded } from '@/shared/api/auth';
import { errorMessage } from '@/shared/api/errorMessage';
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
function relayLink(path: string, returnTo?: string, clientId?: string): string {
  if (!returnTo) return path;
  const params = new URLSearchParams({ return_to: returnTo });
  if (clientId) params.set('client_id', clientId);
  return `${path}?${params.toString()}`;
}

export default function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // 외부 클라이언트(medifinder 등)가 SSO 로 넘긴 복귀 URL. 있으면 로그인 후 그쪽으로 code 를 실어 복귀.
  const returnTo = params.get('return_to') ?? undefined;
  // 그 클라이언트의 공개 ID. 서버가 return_to 검증과 코드 귀속에 쓴다.
  const clientId = params.get('client_id') ?? undefined;
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
      // SSO 면 외부 앱으로 복귀, 아니면 자체 홈으로.
      if (!(await relayCodeIfNeeded(returnTo, clientId))) {
        navigate('/', { replace: true });
      }
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
      <SocialButtons returnTo={returnTo} clientId={clientId} />

      <p className="mt-6 text-center text-sm text-gray-500">
        계정이 없으신가요?{' '}
        <Link
          to={
            relayLink('/auth/signup', returnTo, clientId)
          }
          className="font-semibold text-primary hover:underline"
        >
          회원가입
        </Link>
      </p>
    </AuthCard>
  );
}
