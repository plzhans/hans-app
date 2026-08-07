import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { errorMessage } from '@/shared/api/errorMessage';
import { useAuthStore } from '@/shared/auth/authStore';
import { Button } from '@/shared/ui/Button';
import { TextField } from '@/shared/ui/TextField';
import { AuthCard } from '../components/AuthCard';

interface Form {
  email: string;
  password: string;
}

/**
 * 관리자 로그인. 인증웹(hansapp-auth)의 로그인 화면과 같은 모양이다.
 *
 * **다른 점은 없는 것들이다.**
 * - 소셜 로그인 — 관리자 계정에는 소셜 연동이 없다(이메일/비밀번호 하나뿐).
 * - 회원가입 링크 — 가입 화면이 없다. 계정은 CLI 나 부팅 자동 생성으로만 생긴다.
 * - "로그인 상태 유지" — 관리자 세션은 항상 브라우저를 닫으면 끝난다.
 * - "비밀번호를 잊으셨나요?" — 메일 발송 흐름이 없다. 운영자가 CLI 로 초기화해 준다.
 */
export default function Login() {
  const signIn = useAuthStore((s) => s.signIn);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>();

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setServerError(null);
    try {
      await signIn(email, password);
      // 성공하면 status 가 바뀌고 App 의 라우팅이 화면을 넘긴다.
      // 여기서 navigate 하지 않는다 — 두 곳이 이동을 결정하면 어긋난다.
      // (비밀번호를 바꿔야 하는 계정이면 변경 화면으로 간다.)
    } catch (e) {
      setServerError(errorMessage(e, '로그인에 실패했습니다.'));
    }
  });

  return (
    <AuthCard title="로그인" subtitle="관리자 계정으로 로그인하기">
      <form onSubmit={onSubmit} className="space-y-3">
        <TextField
          label="이메일"
          type="email"
          autoComplete="username"
          autoFocus
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
          <p className="whitespace-pre-line text-sm text-red-500">
            {serverError}
          </p>
        )}
        <Button type="submit" loading={isSubmitting}>
          로그인
        </Button>
      </form>

      <p className="mt-6 text-center text-xs text-gray-400">
        비밀번호를 잊으셨다면 운영자에게 초기화를 요청하세요.
      </p>
    </AuthCard>
  );
}
