import { useEffect, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from '@/shared/auth/authStore';
import Login from '@/features/auth/pages/Login';
import Signup from '@/features/auth/pages/Signup';
import ForgotPassword from '@/features/auth/pages/ForgotPassword';
import Callback from '@/features/auth/pages/Callback';
import Home from '@/features/auth/pages/Home';

/** 인증된 사용자만 접근. 미인증이면 로그인으로 보낸다. */
function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  if (status === 'loading') return <FullScreenSpinner />;
  if (status !== 'authenticated') return <Navigate to="/auth/login" replace />;
  return <>{children}</>;
}

/** 이미 로그인했으면 로그인/가입 페이지 대신 내 정보로. */
function GuestOnly({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  if (status === 'loading') return <FullScreenSpinner />;
  if (status === 'authenticated') return <Navigate to="/auth/me" replace />;
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
 * HansApp **인증 포털**(hansapp-auth). plzhans 계정의 로그인 front door.
 * 모든 연동 서비스(콘솔·medifinder 등)가 로그인을 위해 여기로 리다이렉트해 온다(authorization_endpoint).
 * 앱/콘솔 기능은 담지 않는다 — 순수 로그인·가입·소셜 콜백만 둔다.
 */
export default function App() {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/auth/login"
          element={
            <GuestOnly>
              <Login />
            </GuestOnly>
          }
        />
        <Route
          path="/auth/signup"
          element={
            <GuestOnly>
              <Signup />
            </GuestOnly>
          }
        />
        <Route
          path="/auth/forgot-password"
          element={
            <GuestOnly>
              <ForgotPassword />
            </GuestOnly>
          }
        />
        {/* 소셜 콜백 착지점(1st-party). 백엔드가 이 경로로 code/pending 을 실어 돌려보낸다. */}
        <Route path="/auth/callback" element={<Callback />} />
        {/* 내 정보(로그인 필요). 포털에 직접 로그인한 사용자용. */}
        <Route
          path="/auth/me"
          element={
            <RequireAuth>
              <Home />
            </RequireAuth>
          }
        />
        {/* 포털 루트·미매칭은 로그인으로. */}
        <Route path="*" element={<Navigate to="/auth/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
