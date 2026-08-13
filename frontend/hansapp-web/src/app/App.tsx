import { useEffect, type ReactNode } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { useAuthStore } from '@/shared/auth/authStore';
import { subscribeAuth } from '@/shared/auth/authChannel';
import { watchSessionHint } from '@/shared/auth/sessionWatch';
import { startLogin } from '@/shared/auth/login';
import { trackPageView } from '@/shared/analytics/gtag';
import Dashboard from '@/features/home/pages/Dashboard';
import Apps from '@/features/apps/pages/Apps';
import AppDetail from '@/features/apps/pages/AppDetail';
import BoardPosts from '@/features/board/pages/BoardPosts';
import BoardPost from '@/features/board/pages/BoardPost';
import ServiceTerms from '@/features/legal/pages/ServiceTerms';
import AppTerms from '@/features/legal/pages/AppTerms';
import Privacy from '@/features/legal/pages/Privacy';

/**
 * 로그인 필요 구간. 미인증이면 **인증웹(fe/hans-auth)으로 리다이렉트**한다.
 * 콘솔은 자기 로그인 페이지가 없다 — 인증웹으로 나갔다가 code 를 받아 /auth/callback 으로 돌아온다.
 */
function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  useEffect(() => {
    if (status === 'anonymous') void startLogin();
  }, [status]);
  if (status === 'authenticated') return <>{children}</>;
  // loading 이거나 인증웹으로 나가는 중 — 스피너.
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
    trackPageView();
  }, [location.pathname, location.search]);
  return null;
}

/**
 * HansApp **개발자 콘솔**(hansapp-web). 앱/OAuth 클라이언트 등록·관리.
 * 로그인 UI 는 담지 않는다 — 로그인은 인증웹(fe/hans-auth)의 OAuth 클라이언트로 위임한다.
 */
export default function App() {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const syncFromOtherTab = useAuthStore((s) => s.syncFromOtherTab);
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);
  // 같은 앱의 다른 탭 — BroadcastChannel 로 즉시.
  useEffect(
    () => subscribeAuth((e) => void syncFromOtherTab(e)),
    [syncFromOtherTab],
  );
  // 다른 오리진의 앱(인증웹 ↔ 포털) — 채널이 안 닿으므로 공유 힌트 쿠키를 지켜본다.
  // 사라지면 로그아웃, 생기면 로그인. bootstrap 이 쿠키로 세션을 세운다.
  useEffect(
    () =>
      watchSessionHint((present) => {
        void (present ? bootstrap() : syncFromOtherTab('logout'));
      }),
    [bootstrap, syncFromOtherTab],
  );

  return (
    <BrowserRouter>
      <RouteTracker />
      <Routes>
        {/* 공개 대시보드 */}
        <Route path="/" element={<Dashboard />} />
        {/* 게시판. **공개 라우트다** — 공지사항은 로그인 없이 보여야 한다. */}
        <Route path="/board/:name" element={<BoardPosts />} />
        <Route path="/board/:name/:id" element={<BoardPost />} />
        {/*
          약관·방침. **반드시 공개 라우트다** — 가입 화면(인증웹)이 동의를 받기 전에
          링크하는 곳이라, 로그인을 요구하면 가입하려는 사람이 열 수 없다.

          셋 다 /terms 아래 한 단계로 둔다. 문서가 늘어도 규칙이 그대로고, 스토어·심사
          양식에 적어 넣을 때 접두사가 갈리지 않는다.
        */}
        <Route path="/terms/service" element={<ServiceTerms />} />
        <Route path="/terms/app" element={<AppTerms />} />
        <Route path="/terms/privacy" element={<Privacy />} />
        {/* 옛 주소. 이미 나간 링크가 있을 수 있어 남겨 둔다. */}
        <Route
          path="/terms"
          element={<Navigate to="/terms/service" replace />}
        />
        <Route
          path="/privacy"
          element={<Navigate to="/terms/privacy" replace />}
        />
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
