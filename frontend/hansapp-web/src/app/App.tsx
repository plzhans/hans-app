import { useEffect, type ReactNode } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { useAuthStore } from '@/shared/auth/authStore';
import { startLogin } from '@/shared/auth/login';
import { trackPageView } from '@/shared/analytics/gtag';
import Dashboard from '@/features/home/pages/Dashboard';
import Apps from '@/features/apps/pages/Apps';
import AppDetail from '@/features/apps/pages/AppDetail';

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
 * SPA 라우트 이동을 GA page_view 로 보낸다. 첫 진입도 포함(마운트 시 1회 발화).
 * Router 안에서만 useLocation 을 쓸 수 있어 별도 컴포넌트로 둔다.
 */
function RouteTracker() {
  const location = useLocation();
  useEffect(() => {
    trackPageView(location.pathname + location.search);
  }, [location.pathname, location.search]);
  return null;
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
      <RouteTracker />
      <Routes>
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
