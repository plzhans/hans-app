import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { exchangeCode } from '@/shared/api/auth';
import { takeVerifier } from '@/shared/auth/pkce';
import { consumeState, startLogin } from '@/shared/auth/login';
import { errorMessage } from '@/shared/api/errorMessage';
import { useAuthStore } from '@/shared/auth/authStore';
import { Button } from '@/shared/ui/Button';

/**
 * 콘솔의 OAuth 콜백. 로그인 포털(hansapp-auth)이 실어 보낸 code 를 토큰으로 교환한다.
 *
 * 포털이 신규 가입·소셜 등 로그인 과정을 전부 처리하므로, 콘솔은 성공 결과(code)만 받는다.
 * (가입/소셜 등록 UI 는 포털에 있다 — 콘솔은 순수 클라이언트다.)
 */
export default function Callback() {
  const navigate = useNavigate();
  const authenticate = useAuthStore((s) => s.authenticate);
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    // StrictMode 이중 실행 방지(인가코드는 1회용).
    if (ran.current) return;
    ran.current = true;

    const params = new URLSearchParams(window.location.search);
    const err = params.get('error');
    const code = params.get('code');
    const state = params.get('state');

    if (err) {
      setError(`로그인 실패: ${err}`);
      return;
    }
    if (!code) {
      setError('잘못된 콜백 요청입니다.');
      return;
    }
    // CSRF: 우리가 보낸 state 와 일치해야 한다.
    if (!consumeState(state)) {
      setError('상태 검증 실패(state mismatch).');
      return;
    }
    // 이 브라우저가 시작한 흐름의 verifier. 없으면 교환하지 않는다(code injection 차단).
    const verifier = takeVerifier();
    if (!verifier) {
      setError('로그인 세션을 찾을 수 없습니다. 다시 시도하세요.');
      return;
    }
    void (async () => {
      try {
        await authenticate(await exchangeCode(code, verifier));
        navigate('/apps', { replace: true });
      } catch (e) {
        setError(errorMessage(e, '로그인 처리에 실패했습니다.'));
      }
    })();
  }, [authenticate, navigate]);

  if (!error) {
    return (
      <div className="flex h-full items-center justify-center text-gray-400">
        로그인 처리 중…
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <p className="text-sm text-red-500">{error}</p>
      <Button type="button" onClick={() => void startLogin()}>
        다시 로그인
      </Button>
    </div>
  );
}
