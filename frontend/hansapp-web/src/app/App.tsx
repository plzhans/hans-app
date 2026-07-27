import { useEffect, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from '@/shared/auth/authStore';
import { startLogin } from '@/shared/auth/login';
import Dashboard from '@/features/home/pages/Dashboard';
import Apps from '@/features/apps/pages/Apps';
import AppDetail from '@/features/apps/pages/AppDetail';
import Callback from '@/features/auth/pages/Callback';

/**
 * 로그인 필요 구간. 미인증이면 **로그인 포털(hansapp-auth)로 리다이렉트**한다.
 * 콘솔은 자기 로그인 페이지가 없다 — 포털로 나갔다가 code 를 받아 /auth/callback 으로 돌아온다.
 */
function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  useEffect(() => {
    if (status === 'anonymous') void startLogin();
  }, [status]);
  if (status === 'authenticated') return <>{children}</>;
  // loading 이거나 포털로 나가는 중 — 스피너.
  return <FullScreenSpinner />;
}

function FullScreenSpinner() {
  return (
    <div className="flex h-full items-center justify-center text-gray-400">
      불러오는 중…
    </div>
  );
}

/**
 * HansApp **개발자 콘솔**(hansapp-web). 앱/OAuth 클라이언트 등록·관리.
 * 로그인 UI 는 담지 않는다 — 로그인은 포털(hansapp-auth)의 OAuth 클라이언트로 위임한다.
 */
export default function App() {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return (
    <BrowserRouter>
      <Routes>
        {/* 포털에서 code 를 실어 돌아오는 착지점(콘솔 = OAuth 클라이언트) */}
        <Route path="/auth/callback" element={<Callback />} />
        {/* 공개 대시보드 */}
        <Route path="/" element={<Dashboard />} />
        {/* 앱 관리(로그인 필요) */}
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
