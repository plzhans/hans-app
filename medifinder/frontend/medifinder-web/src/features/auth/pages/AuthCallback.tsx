import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Stethoscope } from 'lucide-react';
import { authClient } from '@/shared/auth/authClient';
import { takeReturnTo } from '@/shared/auth/cache';
import { useAuth } from '@/shared/auth/useAuth';
import { Spinner } from '@/shared/ui/Spinner';

/**
 * 로그인 콜백(`/auth/callback`). 인가코드를 토큰으로 바꾸고 원래 보던 화면으로 되돌린다.
 *
 * **화면이라기보다 통로다.** 성공하면 사용자는 이 페이지를 본 기억이 없어야 하므로,
 * 되돌릴 때 replace 를 쓴다 — 히스토리에 남기면 뒤로가기가 이미 써버린 코드로 다시 온다.
 */
export default function AuthCallback() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const complete = useAuth((s) => s.complete);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    void (async () => {
      const result = await exchangeOnce();
      if (!alive) return;
      if (!result.ok) {
        setError(result.error ?? 'unknown');
        return;
      }
      // 내 정보 조회는 기다리지 않는다(useAuth.complete 주석 참고). 곧바로 원래 자리로.
      complete();
      navigate(takeReturnTo() ?? '/', { replace: true });
    })();

    return () => {
      alive = false;
    };
  }, [complete, navigate]);

  if (error) {
    return (
      <Screen>
        <Mark />
        <p className="text-base font-extrabold text-ink">{t('auth.failed')}</p>
        {/* 사유는 개발자용 식별자라 번역하지 않는다. 사용자에게는 위 한 줄이 메시지다. */}
        <p className="text-xs text-ink-subtle">{error}</p>
        <button
          type="button"
          onClick={() => navigate('/', { replace: true })}
          className="mt-2 rounded-full bg-brand-tint px-4 py-2 text-sm font-bold text-brand-strong"
        >
          {t('auth.backHome')}
        </button>
      </Screen>
    );
  }

  return (
    <Screen>
      <Mark spinning />
      <p className="text-base font-extrabold text-ink">{t('auth.processing')}</p>
      <p className="text-sm text-ink-muted">{t('auth.processingHint')}</p>
    </Screen>
  );
}

/**
 * 이 화면의 껍데기. 헤더도 푸터도 없다 — 사용자가 무엇을 할 자리가 아니라 지나가는 자리다.
 * 대신 **화면 한가운데를 꽉 잡아** 흰 여백만 남지 않게 한다.
 */
function Screen({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-2 bg-surface-sunken px-6 text-center">
      {children}
    </div>
  );
}

/**
 * 서비스 표지. **여기가 어디인지 먼저 말해 준다** — 로그인 화면에서 막 넘어온 참이라
 * 아무 표시 없는 빈 화면이 뜨면 사용자는 엉뚱한 데로 왔거나 멈춘 줄 안다.
 * 헤더의 로고와 같은 연파랑 판을 쓰고, 처리 중에는 그 둘레가 돈다.
 */
function Mark({ spinning = false }: { spinning?: boolean }) {
  return (
    <div className="relative mb-3 flex h-14 w-14 items-center justify-center">
      {spinning && (
        <Spinner className="absolute inset-0 h-14 w-14 border-[3px] border-brand-tint-strong border-t-brand" />
      )}
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-tint text-brand">
        <Stethoscope className="h-5 w-5" />
      </span>
    </div>
  );
}

/**
 * 교환을 **한 번만** 한다.
 *
 * 인가코드도 PKCE verifier 도 1회용이다. StrictMode 는 개발에서 이펙트를 두 번 돌리고,
 * 라우터가 이 화면을 다시 마운트할 수도 있다 — 그때 두 번째 호출은 verifier 가 이미
 * 소비돼 실패한다. 성공한 흐름이 실패 화면으로 끝나는 종류의 버그라 promise 를 공유한다.
 */
let pending: ReturnType<typeof authClient.handleCallback> | null = null;

function exchangeOnce() {
  pending ??= authClient.handleCallback();
  return pending;
}
