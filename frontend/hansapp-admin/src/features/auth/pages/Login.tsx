import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ShieldAlert } from 'lucide-react';

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
 *
 * **"비밀번호를 잊으셨나요?" 는 있다.** 재설정 링크를 메일로 보낸다 — 다만 메일 발송이
 * 꺼져 있으면 아무것도 나가지 않으므로, 그 환경에서는 여전히 다른 관리자에게 초기화를
 * 요청하는 것이 유일한 길이다.
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
      {/*
        **제한 구역 안내.** 폼 위에 둔다 — 로그인 뒤에는 볼 일이 없고, 치기 전에 읽어야
        뜻이 있는 문장이다.

        **적어 둔 것은 실제로 하는 일이다.** 로그인 시도는 성공·실패 모두 IP·기기와 함께
        기록된다(admin_action_log). 지키지 않는 경고를 붙여 두면 나머지 문장도 같이 가벼워진다.
      */}
      <div className="mb-5 flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <p className="text-xs leading-relaxed text-amber-800">
          <b className="font-semibold">허가된 관리자만 사용할 수 있는 페이지입니다.</b>
          <br />
          모든 접속 시도는 IP·접속 기기와 함께 기록되며, 허가되지 않은 접근은
          차단됩니다.
        </p>
      </div>

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
          // 잠깐 보고 확인할 수 있게. 짝이 없는 칸이라 스스로 열고 닫는다.
          revealable
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
        <Link to="/forgot-password" className="hover:text-primary hover:underline">
          비밀번호를 잊으셨나요?
        </Link>
      </p>
    </AuthCard>
  );
}
