import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';

import { forgotPassword } from '@/shared/api/auth';
import { errorMessage } from '@/shared/api/errorMessage';
import { Button } from '@/shared/ui/Button';
import { TextField } from '@/shared/ui/TextField';
import { AuthCard } from '../components/AuthCard';

interface Form {
  email: string;
}

/**
 * 비밀번호 찾기 — 재설정 링크를 메일로 받는다.
 *
 * **보냈는지 아닌지를 화면이 가른 적이 없다.** 서버가 계정 존재를 일부러 가리기 때문에
 * (없는 주소여도 204) 여기서 "그런 계정이 없습니다" 를 말할 방법도 없고, 말해서도 안 된다 —
 * 그 한마디가 "이 주소는 관리자다" 를 알려 주는 것이라 로그인 실패 문구를 하나로 맞춰 둔
 * 것과 같은 이유다. 그래서 성공 화면은 "보냈다" 가 아니라 **"보냈다면 도착할 것"** 이라고 말한다.
 */
export default function ForgotPassword() {
  const [sent, setSent] = useState<string>();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>();

  const onSubmit = handleSubmit(async ({ email }) => {
    setServerError(null);
    try {
      await forgotPassword(email);
      setSent(email);
    } catch (e) {
      // 여기 걸리는 것은 대개 요청 한도(429)이거나 서버가 죽은 경우다.
      setServerError(errorMessage(e, '요청을 보내지 못했습니다.'));
    }
  });

  if (sent) {
    return (
      <AuthCard title="메일을 확인하세요">
        <p className="text-sm leading-relaxed text-gray-600">
          <b className="text-gray-900">{sent}</b> 로 가입된 관리자 계정이
          있다면, 비밀번호를 다시 정하는 링크를 보냈습니다.
        </p>
        <ul className="mt-4 space-y-1.5 text-xs text-gray-400">
          <li>· 링크는 30분 동안, 한 번만 쓸 수 있습니다.</li>
          <li>· 메일이 안 보이면 스팸함도 확인해 보세요.</li>
          <li>
            · 그래도 오지 않으면 다른 관리자에게 비밀번호 초기화를 요청하세요.
          </li>
        </ul>

        <div className="mt-6">
          <Link
            to="/login"
            className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            로그인으로 돌아가기
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="비밀번호 찾기"
      subtitle="가입된 이메일로 재설정 링크를 보냅니다"
    >
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
        {serverError && (
          <p className="whitespace-pre-line text-sm text-red-500">
            {serverError}
          </p>
        )}
        <Button type="submit" loading={isSubmitting}>
          재설정 링크 받기
        </Button>
      </form>

      <p className="mt-6 text-center text-xs text-gray-400">
        <Link to="/login" className="hover:text-primary hover:underline">
          로그인으로 돌아가기
        </Link>
      </p>
    </AuthCard>
  );
}
