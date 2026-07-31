import { useEffect, useState, type ReactNode } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useSearchParams,
} from 'react-router-dom';
import { useAuthStore } from '@/shared/auth/authStore';
import { goAfterLogin, readAfterLoginParams } from '@/shared/auth/afterLogin';
import { subscribeAuth } from '@/shared/auth/authChannel';
import Login from '@/features/auth/pages/Login';
import Signup from '@/features/auth/pages/Signup';
import ForgotPassword from '@/features/auth/pages/ForgotPassword';
import Callback from '@/features/auth/pages/Callback';
import Home from '@/features/auth/pages/Home';

/** 로컬 단일 오리진에선 /auth 프리픽스 아래로 마운트한다(VITE_ROUTER_BASE). 배포(서브도메인)는 루트. */
// **?? 가 아니라 || 다.** .env 에 키만 적고 값을 비워 두는 일이 있는데(누수 방지),
// ?? 는 빈 문자열을 통과시켜 basename 이 '' 가 된다. vite base 쪽도 같은 이유로 || 를 쓴다.
const ROUTER_BASE =
  (import.meta.env.VITE_ROUTER_BASE as string | undefined) || '/';

/** 인증된 사용자만 접근. 미인증이면 로그인으로 보낸다. */
function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  if (status === 'loading') return <FullScreenSpinner />;
  if (status !== 'authenticated') return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/**
 * 이미 로그인했으면 인증 화면 대신 **원래 가려던 곳**으로.
 *
 * 그냥 /me 로 보내면 안 된다. 포털이 `?return=` 을 달아 보냈는데 그 값을 잃으면 사용자가
 * 제자리로 못 돌아가고, 외부 SSO(`client_id`)면 그 앱은 인가코드를 영영 못 받는다.
 * 판정은 로그인 직후와 **같은 규칙**(goAfterLogin)을 쓴다.
 */
function GuestOnly({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  if (status === 'loading') return <FullScreenSpinner />;
  if (status === 'authenticated') return <AlreadyLoggedIn />;
  return <>{children}</>;
}

/** 로그인된 채로 인증 화면에 온 사용자를 복귀시킨다. 보낼 곳이 없으면 /me. */
function AlreadyLoggedIn() {
  const [params] = useSearchParams();
  const [stay, setStay] = useState(false);

  useEffect(() => {
    let alive = true;
    // 실패(예: SSO 인데 code_challenge 누락)해도 인증 화면에 가두지 않고 /me 로 보낸다.
    goAfterLogin(readAfterLoginParams(params))
      .catch(() => false)
      .then((moved) => {
        if (alive && !moved) setStay(true);
      });
    return () => {
      alive = false;
    };
  }, [params]);

  // 이동이 결정될 때까지는 로그인 폼을 깜빡이지 않는다.
  return stay ? <Navigate to="/me" replace /> : <FullScreenSpinner />;
}

function FullScreenSpinner() {
  return (
    <div className="flex h-full items-center justify-center text-gray-400">
      불러오는 중…
    </div>
  );
}

/**
 * HansApp **인증웹**(fe/hans-auth). plzhans 계정 로그인 front door(authorization_endpoint).
 * 인증웹 자체가 auth 이므로 라우트에 /auth 프리픽스를 두지 않는다 — /login, /signup, /callback.
 * (배포: auth.plzhans.com/login. 로컬 단일오리진: 127.0.0.1/auth/login 은 VITE_ROUTER_BASE=/auth 로 마운트.)
 */
export default function App() {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const syncFromOtherTab = useAuthStore((s) => s.syncFromOtherTab);
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);
  // 다른 탭의 로그인·로그아웃을 새로고침 없이 따라간다.
  useEffect(
    () => subscribeAuth((e) => void syncFromOtherTab(e)),
    [syncFromOtherTab],
  );

  return (
    <BrowserRouter basename={ROUTER_BASE}>
      <Routes>
        <Route
          path="/login"
          element={
            <GuestOnly>
              <Login />
            </GuestOnly>
          }
        />
        <Route
          path="/signup"
          element={
            <GuestOnly>
              <Signup />
            </GuestOnly>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <GuestOnly>
              <ForgotPassword />
            </GuestOnly>
          }
        />
        {/* 소셜 콜백 착지점(1st-party). 백엔드가 이 경로로 code/pending 을 실어 돌려보낸다. */}
        <Route path="/callback" element={<Callback />} />
        {/* 내 정보(로그인 필요). 인증웹에 직접 로그인한 사용자용. */}
        <Route
          path="/me"
          element={
            <RequireAuth>
              <Home />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
