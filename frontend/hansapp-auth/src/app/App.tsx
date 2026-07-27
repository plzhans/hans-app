import { useEffect, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from '@/shared/auth/authStore';
import Login from '@/features/auth/pages/Login';
import Signup from '@/features/auth/pages/Signup';
import ForgotPassword from '@/features/auth/pages/ForgotPassword';
import Callback from '@/features/auth/pages/Callback';
import Home from '@/features/auth/pages/Home';

/** 로컬 단일 오리진에선 /auth 프리픽스 아래로 마운트한다(VITE_ROUTER_BASE). 배포(서브도메인)는 루트. */
const ROUTER_BASE = (import.meta.env.VITE_ROUTER_BASE as string | undefined) ?? '/';

/** 인증된 사용자만 접근. 미인증이면 로그인으로 보낸다. */
function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  if (status === 'loading') return <FullScreenSpinner />;
  if (status !== 'authenticated') return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** 이미 로그인했으면 로그인/가입 페이지 대신 내 정보로. */
function GuestOnly({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  if (status === 'loading') return <FullScreenSpinner />;
  if (status === 'authenticated') return <Navigate to="/me" replace />;
  return <>{children}</>;
}

function FullScreenSpinner() {
  return (
    <div className="flex h-full items-center justify-center text-gray-400">
      불러오는 중…
    </div>
  );
}

/**
 * HansApp **인증 포털**(hansapp-auth). plzhans 계정 로그인 front door(authorization_endpoint).
 * 포털 자체가 auth 이므로 라우트에 /auth 프리픽스를 두지 않는다 — /login, /signup, /callback.
 * (배포: auth.plzhans.com/login. 로컬 단일오리진: 127.0.0.1/auth/login 은 VITE_ROUTER_BASE=/auth 로 마운트.)
 */
export default function App() {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

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
        {/* 내 정보(로그인 필요). 포털에 직접 로그인한 사용자용. */}
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
