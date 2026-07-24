import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { emailSignup, relayCodeIfNeeded } from '@/shared/api/auth';
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
function relayLink(path: string, returnTo?: string, clientId?: string): string {
  if (!returnTo) return path;
  const params = new URLSearchParams({ return_to: returnTo });
  if (clientId) params.set('client_id', clientId);
  return `${path}?${params.toString()}`;
}

export default function Signup() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnTo = params.get('return_to') ?? undefined;
  // 그 클라이언트의 공개 ID. 서버가 return_to 검증과 코드 귀속에 쓴다.
  const clientId = params.get('client_id') ?? undefined;
  const authenticate = useAuthStore((s) => s.authenticate);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<Form>();

  const onSubmit = handleSubmit(async ({ email, password, name }) => {
    setServerError(null);
    try {
      const tokens = await emailSignup(email, password, name);
      await authenticate(tokens);
      if (!(await relayCodeIfNeeded(returnTo, clientId))) {
        navigate('/', { replace: true });
      }
    } catch (e) {
      setServerError(errorMessage(e, '회원가입에 실패했습니다.'));
    }
  });

  return (
    <AuthCard title="회원가입" subtitle="이메일로 HansApp 계정 만들기">
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
          회원가입
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        이미 계정이 있으신가요?{' '}
        <Link
          to={
            relayLink('/auth/login', returnTo, clientId)
          }
          className="font-semibold text-primary hover:underline"
        >
          로그인
        </Link>
      </p>
    </AuthCard>
  );
}
