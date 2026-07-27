import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { emailLogin, relayCodeIfNeeded } from '@/shared/api/auth';
import { errorMessage } from '@/shared/api/errorMessage';
import { useAuthStore } from '@/shared/auth/authStore';
import { isAllowedReturn } from '@/shared/auth/returnTo';
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
  // 외부 클라이언트(medifinder 등)가 SSO 로 넘긴 복귀 URL. 있으면 로그인 후 그쪽으로 code 를 실어 복귀.
  const returnTo = params.get('redirect_uri') ?? undefined;
  // 그 클라이언트의 공개 ID. 서버가 return_to 검증과 코드 귀속에 쓴다.
  const clientId = params.get('client_id') ?? undefined;
  // 외부 앱이 만든 PKCE challenge. 포털은 **전달만** 한다 — verifier 는 그 앱에 있다.
  const codeChallenge = params.get('code_challenge') ?? undefined;
  // 그 앱의 state. 해석하지 않고 최종 복귀 URL 에 그대로 돌려준다.
  const clientState = params.get('state') ?? undefined;
  const authenticate = useAuthStore((s) => s.authenticate);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>();

  // 1st-party 앱(콘솔 등)의 복귀 URL. 소셜은 콜백 URL(ret=)로, 이메일은 이 값으로 바로 복귀한다.
  const appReturn = params.get('return') ?? undefined;

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setServerError(null);
    try {
      const tokens = await emailLogin(email, password);
      await authenticate(tokens);
      // ① 외부 SSO(client_id) → 인가코드를 실어 그 앱으로 복귀.
      if (await relayCodeIfNeeded(returnTo, clientId, codeChallenge, clientState)) {
        return;
      }
      // ② 1st-party return(자사 앱, 쿠키 SSO) → code 없이 그 앱으로 복귀. 앱이 공유 쿠키로 세션 인지.
      //    이메일 로그인은 왕복이 없어 URL 의 return 을 바로 쓴다(허용 오리진만, open-redirect 방지).
      if (appReturn && isAllowedReturn(appReturn)) {
        window.location.href = appReturn;
        return;
      }
      // ③ 포털 자체 로그인 → 내 정보.
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
