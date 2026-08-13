import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ShieldAlert } from 'lucide-react';

import { errorMessage } from '@/shared/api/errorMessage';
import {
  getSocialProviders,
  googleLoginUrl,
  socialErrorMessage,
} from '@/shared/api/social';
import { useAuthStore } from '@/shared/auth/authStore';
import { Button } from '@/shared/ui/Button';
import { TextField } from '@/shared/ui/TextField';
import { AuthCard } from '../components/AuthCard';
import { GoogleButton } from '../components/GoogleButton';

interface Form {
  email: string;
  password: string;
}

/**
 * 관리자 로그인. 인증웹(hansapp-auth)의 로그인 화면과 같은 모양이다.
 *
 * **다른 점은 없는 것들이다.**
 * - 회원가입 링크 — 가입 화면이 없다. 계정은 CLI 나 부팅 자동 생성으로만 생긴다.
 * - "로그인 상태 유지" — 관리자 세션은 항상 브라우저를 닫으면 끝난다.
 *
 * **구글 로그인은 비밀번호를 대체하지 않는다.** 구글로 들어온 계정도 비밀번호로 들어올 수
 * 있고(GitLab 과 같은 방식), 구글이 설정돼 있지 않으면 버튼 자체가 나오지 않는다.
 * 계정을 만들어 주지도 않는다 — 그 이메일의 관리자가 이미 있어야 들어온다.
 *
 * **"비밀번호를 잊으셨나요?" 는 있다.** 재설정 링크를 메일로 보낸다 — 다만 메일 발송이
 * 꺼져 있으면 아무것도 나가지 않으므로, 그 환경에서는 여전히 다른 관리자에게 초기화를
 * 요청하는 것이 유일한 길이다.
 */
export default function Login() {
  const signIn = useAuthStore((s) => s.signIn);
  const [serverError, setServerError] = useState<string | null>(null);
  const [googleReady, setGoogleReady] = useState(false);
  const [params, setParams] = useSearchParams();

  /*
    콜백이 실패를 쿼리로 실어 보낸다(구글에서 곧장 돌아오는 요청이라 응답 본문을 쓸 수 없다).
    **읽어서 상태로 옮기고 주소에서 지운다** — 새로고침할 때마다 지난 실패가 되살아나면 안 된다.
  */
  useEffect(() => {
    const code = params.get('social_error');
    if (!code) return;
    setServerError(socialErrorMessage(code));
    setParams({}, { replace: true });
  }, [params, setParams]);

  /*
    설정(admin.google.*)이 비어 있으면 버튼을 그리지 않는다. 눌러 봐야 404 라,
    보여 주면 "구글 로그인이 있는데 안 된다" 가 된다.
  */
  useEffect(() => {
    void getSocialProviders()
      .then((p) => setGoogleReady(p.google))
      // 못 물어봤으면 없는 것으로 둔다. 비밀번호 로그인은 그대로 되므로 화면이 막히지 않는다.
      .catch(() => setGoogleReady(false));
  }, []);

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

      {/*
        **구글은 비밀번호 아래에 둔다.** 관리자의 기본 통로는 비밀번호이고 구글은 편의라,
        위에 놓으면 순서가 뒤집힌 것으로 읽힌다. 설정이 안 됐으면 아예 그리지 않는다.
      */}
      {googleReady && (
        <>
          <div className="my-5 flex items-center gap-3 text-xs text-gray-300">
            <span className="h-px flex-1 bg-gray-200" />
            또는
            <span className="h-px flex-1 bg-gray-200" />
          </div>
          <GoogleButton href={googleLoginUrl()} label="구글로 로그인" />
        </>
      )}

      <p className="mt-6 text-center text-xs text-gray-400">
        <Link to="/forgot-password" className="hover:text-primary hover:underline">
          비밀번호를 잊으셨나요?
        </Link>
      </p>
    </AuthCard>
  );
}
