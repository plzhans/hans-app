import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  exchangeCode,
  socialRegister,
  socialRegisterRequestCode,
} from '@/shared/api/auth';
import { hasSessionHint } from '@/shared/api/session';
import { takeVerifier } from '@/shared/auth/pkce';
import { isFirstPartyReturn } from '@/shared/auth/returnTo';
import { errorMessage } from '@/shared/api/errorMessage';
import { useAuthStore } from '@/shared/auth/authStore';
import { Button } from '@/shared/ui/Button';
import { TextField } from '@/shared/ui/TextField';
import { AuthCard } from '../components/AuthCard';
import {
  ConsentFields,
  CONSENT_REQUIRED_MESSAGE,
  EMPTY_CONSENT,
  isConsented,
  toConsentPayload,
  type ConsentState,
} from '../components/ConsentFields';

type Phase = 'processing' | 'register' | 'error';

const ERROR_MESSAGES: Record<string, string> = {
  email_exists:
    '이미 가입된 이메일입니다. 이메일 로그인 후 마이페이지에서 연동하세요.',
  withdrawn_cooldown: '탈퇴 후 재가입 제한기간입니다. 잠시 후 다시 시도하세요.',
  already_linked_other: '이 소셜 계정은 다른 회원에 이미 연동돼 있습니다.',
  link_requires_login: '연동은 로그인 상태에서만 가능합니다.',
  invalid_account: '유효하지 않은 계정입니다.',
};

/**
 * 소셜 콜백 착지점. 백엔드가 실어 보낸 결과(code/pending/error)를 처리한다.
 *  - code            → 인가코드 교환 → 로그인
 *  - pending         → **가입 화면**(약관 동의 + 필요하면 이메일 확인·코드 인증) → 가입 확정
 *
 * **pending 은 예외 없이 화면을 한 번 지난다.** 예전에는 구글처럼 provider 가 이메일을 검증해
 * 준 경우 곧바로 가입시켰는데, 그러면 두 가지가 어긋난다.
 *
 *   1. 약관 동의를 받을 자리가 없다. 제공자의 동의창은 "정보를 준다" 는 동의지 우리 약관
 *      동의가 아니라, 그대로 두면 동의 없이 계정이 생긴다.
 *   2. **로그인만 하려던 사람이 되돌릴 틈 없이 가입된다.** 신규인지 기존인지는 눌러 보기
 *      전에는 모른다.
 *
 * 여기는 우리가 발급한 15분짜리 티켓 구간이라 시간에 쫓기지 않는다 — provider 의 인가코드는
 * 백엔드 콜백에서 이미 교환돼 소진됐고, 그 결과(프로필)가 티켓에 실려 온 상태다.
 */
export default function Callback() {
  const navigate = useNavigate();
  const authenticate = useAuthStore((s) => s.authenticate);
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const [phase, setPhase] = useState<Phase>('processing');
  const [message, setMessage] = useState('');

  // pending(register) 상태
  const ticketRef = useRef<string | null>(null);
  const [emailEditable, setEmailEditable] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  /** provider 가 이메일을 검증하지 않아 우리 코드 인증이 필요한가(구글은 false). */
  const [codeNeeded, setCodeNeeded] = useState(false);
  const [consent, setConsent] = useState<ConsentState>(EMPTY_CONSENT);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ran = useRef(false);

  // 로그인 완료 후 이동: 1st-party return(자사 앱) 있으면 그리로, 아니면 인증웹 내 정보로.
  // return 은 콜백 URL 의 ret= 로 온다(백엔드 서명 state 의 returnTo 로 왕복). 1st-party 만 따른다
  // (백엔드가 이미 rootDomain 으로 검증했으므로 여기선 방어적 이중 확인).
  const goAfterAuth = () => {
    const back = new URLSearchParams(window.location.search).get('ret');
    if (back && isFirstPartyReturn(back)) window.location.href = back;
    else navigate('/me', { replace: true });
  };

  useEffect(() => {
    // StrictMode 이중 실행 방지(인가코드는 1회용이라 두 번 교환하면 실패한다).
    if (ran.current) return;
    ran.current = true;

    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    const code = params.get('code');
    const pending = params.get('pending');
    const emailRequired = params.get('email_required') === '1';
    const codeRequired = params.get('code_required') === '1';
    const prefillEmail = params.get('email') ?? '';

    const finish = async (
      promise: Promise<Parameters<typeof authenticate>[0]>,
    ) => {
      try {
        await authenticate(await promise);
        goAfterAuth();
      } catch (e) {
        setPhase('error');
        setMessage(errorMessage(e, '로그인 처리에 실패했습니다.'));
      }
    };

    if (error) {
      setPhase('error');
      setMessage(ERROR_MESSAGES[error] ?? `로그인 실패: ${error}`);
      return;
    }
    if (code) {
      // 이 브라우저가 시작한 흐름의 verifier 를 꺼낸다. 없으면 교환하지 않는다.
      const verifier = takeVerifier();
      if (!verifier) {
        setPhase('error');
        return;
      }
      void finish(exchangeCode(code, verifier));
      return;
    }
    if (pending) {
      // **바로 가입시키지 않는다**(위 주석 참고). 동의를 받을 화면을 반드시 지난다.
      ticketRef.current = pending;
      setEmail(prefillEmail);
      setEmailEditable(emailRequired);
      setCodeNeeded(codeRequired);
      setPhase('register');
      return;
    }
    // **code 도 pending 도 없다 = 쿠키로 이미 로그인이 끝났다는 뜻이다.**
    // 자사 소셜 로그인은 인가코드를 만들지 않고 백엔드가 콜백에서 refresh 쿠키를 심는다.
    // URL 에 실을 것이 없을 뿐 실패가 아니다 — 세션을 세우고 원래 가려던 곳으로 보낸다.
    void (async () => {
      if (hasSessionHint()) {
        await bootstrap();
        if (useAuthStore.getState().status === 'authenticated') {
          goAfterAuth();
          return;
        }
      }
      setPhase('error');
      setMessage('잘못된 콜백 요청입니다.');
    })();
  }, [authenticate, bootstrap, navigate]);

  /** 동의가 안 됐으면 막고 문구를 띄운다. 진행해도 되면 true. */
  const passConsent = (): boolean => {
    if (isConsented(consent)) {
      setConsentError(null);
      return true;
    }
    setConsentError(CONSENT_REQUIRED_MESSAGE);
    return false;
  };

  const onRequestCode = async () => {
    if (!ticketRef.current) return;
    if (!passConsent()) return;
    if (emailEditable && !email.trim()) {
      setMessage('이메일을 입력하세요.');
      return;
    }
    setMessage('');
    setBusy(true);
    try {
      await socialRegisterRequestCode(ticketRef.current, email.trim() || undefined);
      setCodeSent(true);
    } catch (e) {
      setMessage(errorMessage(e, '인증 코드 발송에 실패했습니다.'));
    } finally {
      setBusy(false);
    }
  };

  const onConfirm = async () => {
    if (!ticketRef.current) return;
    if (!passConsent()) return;
    if (codeNeeded && !code.trim()) {
      setMessage('인증 코드를 입력하세요.');
      return;
    }
    setMessage('');
    setBusy(true);
    try {
      const tokens = await socialRegister(
        ticketRef.current,
        toConsentPayload(consent),
        email.trim() || undefined,
        // 코드 인증이 필요 없는 provider(구글)는 코드를 보내지 않는다.
        codeNeeded ? code.trim() : undefined,
      );
      await authenticate(tokens);
      goAfterAuth();
    } catch (e) {
      setMessage(errorMessage(e, '가입에 실패했습니다.'));
    } finally {
      setBusy(false);
    }
  };

  if (phase === 'processing') {
    return (
      <div className="flex h-full items-center justify-center text-gray-400">
        로그인 처리 중…
      </div>
    );
  }

  if (phase === 'register') {
    return (
      <AuthCard
        title="회원가입"
        subtitle={
          codeNeeded
            ? '가입을 완료하려면 이메일 인증이 필요합니다.'
            : '소셜 계정으로 HansApp 계정을 만듭니다.'
        }
      >
        <div className="space-y-3">
          <TextField
            label="이메일"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={!emailEditable || codeSent}
            hint={
              emailEditable ? undefined : '소셜 계정에서 가져온 이메일입니다.'
            }
          />

          {codeNeeded && codeSent && (
            <TextField
              label="인증 코드"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="메일로 받은 6자리 코드"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          )}

          <ConsentFields
            value={consent}
            onChange={(next) => {
              setConsent(next);
              if (consentError) setConsentError(null);
            }}
            error={consentError ?? undefined}
          />

          {message && <p className="text-sm text-red-500">{message}</p>}

          {/*
            코드 인증이 필요 없는 provider(구글)는 발송 단계가 없다 — 동의만 하면 바로 가입이다.
            필요한 쪽은 [인증 코드 받기] → [가입 완료] 두 단계를 그대로 지난다.
          */}
          {codeNeeded && !codeSent ? (
            <Button type="button" loading={busy} onClick={onRequestCode}>
              인증 코드 받기
            </Button>
          ) : (
            <Button type="button" loading={busy} onClick={onConfirm}>
              가입 완료
            </Button>
          )}
        </div>

        {codeNeeded && codeSent && (
          <button
            type="button"
            onClick={onRequestCode}
            className="mt-4 block w-full text-center text-sm text-gray-500 hover:underline"
          >
            코드 재발송
          </button>
        )}
      </AuthCard>
    );
  }

  return (
    <AuthCard title="로그인 실패">
      <p className="text-center text-sm text-gray-600">{message}</p>
      <Link
        to="/login"
        className="mt-6 block text-center text-sm font-semibold text-primary hover:underline"
      >
        로그인으로 돌아가기
      </Link>
    </AuthCard>
  );
}
