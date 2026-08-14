import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { emailLogin } from '@/shared/api/auth';
import { errorMessage } from '@/shared/api/errorMessage';
import { goAfterLogin, readAfterLoginParams } from '@/shared/auth/afterLogin';
import { useAuthStore } from '@/shared/auth/authStore';
import { Button } from '@/shared/ui/Button';
import { FieldRow } from '@/shared/ui/FieldRow';
import { TextField } from '@/shared/ui/TextField';
import { socialErrorMessage } from '../socialError';
import { AlertBox } from '@/shared/ui/AlertBox';
import { AuthCard } from '../components/AuthCard';
import { SocialButtons } from '../components/SocialButtons';

interface Form {
  email: string;
  password: string;
  /** 로그인 상태 유지. 켜면 브라우저를 닫아도 로그인이 남는다. */
  rememberMe: boolean;
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
  /*
    소셜이 실패해 되돌아온 경우의 사유. **별도 화면이 아니라 여기 띄운다** — 사용자가 하려던
    일은 로그인이고, 다음 행동(이메일로 로그인·다른 소셜)이 전부 이 화면에 있다.
    실패 화면을 따로 두면 읽고 나서 "돌아가기" 를 한 번 더 눌러야 제자리가 된다.
  */
  const socialError = params.get('error');
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Form>();
  // 소셜 버튼도 같은 체크박스를 따른다. RHF 입력은 비제어라 watch 로 현재 값을 읽어야
  // 방금 켠 선택이 반영된다 — 안 읽으면 소셜만 늘 유지되어 체크박스가 거짓말을 한다.
  const rememberMe = watch('rememberMe', false);

  const onSubmit = handleSubmit(async ({ email, password, rememberMe }) => {
    setServerError(null);
    try {
      const tokens = await emailLogin(email, password, rememberMe);
      await authenticate(tokens);
      // 복귀 규칙은 goAfterLogin 한 곳에 있다 — 이미 로그인한 채로 /login 에 온 경우
      // (App 의 GuestOnly)와 **같은 판정**이어야 해서 공유한다.
      if (await goAfterLogin(after)) return;
      navigate('/me', { replace: true });
    } catch (e) {
      setServerError(errorMessage(e, 'Sign-in failed.'));
    }
  });

  return (
    <AuthCard
      title="Sign in"
      // 광고를 켜는 화면은 지금 여기 하나다. PC 에서 카드가 두 배가 되고 오른쪽이 광고 단이다.
      ads
    >
      {/* 소셜 흐름이 실패해 이 화면으로 되돌아온 경우. 같은 사유가 가입 화면에도 뜨므로 상자를 공유한다. */}
      {socialError && (
        <div className="mb-4">
          <AlertBox>{socialErrorMessage(socialError)}</AlertBox>
        </div>
      )}
      <form onSubmit={onSubmit} className="space-y-3">
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          error={errors.email?.message}
          {...register('email', { required: 'Enter your email.' })}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          error={errors.password?.message}
          {...register('password', { required: 'Enter your password.' })}
        />
        {/*
          로그인 상태 유지. **기본은 꺼짐이다** — 공용 PC 에서 실수로 남는 쪽보다, 원하는
          사람이 한 번 더 누르는 쪽이 낫다. 켜면 브라우저를 닫아도 로그인이 남는다.
        */}
        {/* 레이블 없는 줄들. PC 에서 입력칸과 왼쪽 끝을 맞추려고 같은 껍데기를 쓴다. */}
        <FieldRow as="div">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              className="h-4 w-4 shrink-0 accent-primary"
              {...register('rememberMe')}
            />
            <span>Keep me signed in</span>
          </label>
        </FieldRow>
        {serverError && (
          <FieldRow as="div">
            <p className="whitespace-pre-line text-sm text-red-500">
              {serverError}
            </p>
          </FieldRow>
        )}
        <FieldRow as="div">
          <Button type="submit" loading={isSubmitting} loadingText="Signing in…">
            Sign in
          </Button>
        </FieldRow>
      </form>

      {/* 번역이 갈리지 않는 단어는 영어로 둔다(레이블도 같은 이유로 Email·Password 다). */}
      <div className="my-5 flex items-center gap-3 text-xs text-gray-400">
        <span className="h-px flex-1 bg-gray-200" />
        or
        <span className="h-px flex-1 bg-gray-200" />
      </div>
      <SocialButtons
        returnTo={returnTo}
        clientId={clientId}
        codeChallenge={codeChallenge}
        clientState={clientState}
        appReturn={appReturn}
        remember={rememberMe}
      />

      <p className="mt-6 text-center text-sm text-gray-500">
        Don&apos;t have an account?{' '}
        <Link
          to={
            relayLink('/signup', returnTo, clientId, codeChallenge, clientState)
          }
          className="font-semibold text-primary hover:underline"
        >
          Sign up
        </Link>
      </p>
      {/*
        비밀번호 찾기. **가입 링크 아래, 내용의 맨 끝이다.** 로그인하러 온 사람의 길(입력 →
        로그인 → 소셜 → 없으면 가입)을 다 지나온 자리라, 여기 두면 그 흐름을 끊지 않는다.
        모바일·PC 가 같은 자리다 — 화면마다 다른 데 있으면 찾는 데 시간이 든다.
      */}
      <p className="mt-2 text-center text-sm">
        <Link
          to={relayLink(
            '/forgot-password',
            returnTo,
            clientId,
            codeChallenge,
            clientState,
          )}
          className="text-gray-500 hover:text-primary hover:underline"
        >
          Forgot your password?
        </Link>
      </p>
    </AuthCard>
  );
}
