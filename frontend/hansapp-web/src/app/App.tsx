import { useEffect, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from '@/shared/auth/authStore';
import Dashboard from '@/features/home/pages/Dashboard';
import Apps from '@/features/apps/pages/Apps';
import AppDetail from '@/features/apps/pages/AppDetail';
import Login from '@/features/auth/pages/Login';
import Signup from '@/features/auth/pages/Signup';
import Callback from '@/features/auth/pages/Callback';
import Home from '@/features/auth/pages/Home';

/** 인증된 사용자만 접근. 미인증이면 로그인으로 보낸다. */
function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  if (status === 'loading') return <FullScreenSpinner />;
  if (status !== 'authenticated') return <Navigate to="/auth/login" replace />;
  return <>{children}</>;
}

/** 이미 로그인했으면 로그인/가입 페이지 대신 홈으로. */
function GuestOnly({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  if (status === 'loading') return <FullScreenSpinner />;
  if (status === 'authenticated') return <Navigate to="/" replace />;
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
 * HansApp 포털 웹. plzhans 계정의 front door(모든 연동 서비스의 인증 기반).
 *  - /          공개 랜딩(GNB + 로그인 + 서비스 바로가기)
 *  - /auth/*    로그인 관련(로그인·가입·소셜 콜백)
 *  - /auth/me   내 정보(로그인 필요)
 *  - /console/* 앱 콘솔(추후)
 */
export default function App() {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return (
    <BrowserRouter>
      <Routes>
        {/* 로그인 관련 (/auth) */}
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
        {/* 소셜 콜백 착지점. 백엔드가 이 경로로 code/pending 을 실어 돌려보낸다. */}
        <Route path="/auth/callback" element={<Callback />} />

        {/* 내 정보(로그인 필요) */}
        <Route
          path="/auth/me"
          element={
            <RequireAuth>
              <Home />
            </RequireAuth>
          }
        />

        {/* 앱 관리(로그인 필요) — HansAPI 클라이언트 등록·시크릿 발급 */}
        <Route
          path="/apps"
          element={
            <RequireAuth>
              <Apps />
            </RequireAuth>
          }
        />
        <Route
          path="/apps/:id"
          element={
            <RequireAuth>
              <AppDetail />
            </RequireAuth>
          }
        />

        {/* 공개 대시보드(포털 첫 페이지) */}
        <Route path="/" element={<Dashboard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
