import { useEffect, useState, type ReactNode } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useSearchParams,
} from 'react-router-dom';
import { errorMessage } from '@/shared/api/errorMessage';
import { useAuthStore } from '@/shared/auth/authStore';
import {
  goAfterLogin,
  readAfterLoginParams,
  validateAfterLoginParams,
} from '@/shared/auth/afterLogin';
import { subscribeAuth } from '@/shared/auth/authChannel';
import Login from '@/features/auth/pages/Login';
import Signup from '@/features/auth/pages/Signup';
import ForgotPassword from '@/features/auth/pages/ForgotPassword';
import Callback from '@/features/auth/pages/Callback';
import Logout from '@/features/auth/pages/Logout';
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
  const [params] = useSearchParams();
  // 로그인 여부보다 **먼저** 본다. 어차피 발급이 거절될 요청이면 폼을 띄울 이유가 없고,
  // 이미 로그인한 사용자를 조용히 /me 로 보내 앱이 무한정 기다리게 만들어서도 안 된다.
  const problem = validateAfterLoginParams(readAfterLoginParams(params));
  if (problem) return <BadAuthRequest reason={problem} />;
  if (status === 'loading') return <FullScreenSpinner />;
  if (status === 'authenticated') return <AlreadyLoggedIn />;
  return <>{children}</>;
}

/**
 * 처리할 수 없는 인증 요청. 보낸 앱의 연동 오류라 사용자가 할 수 있는 게 없으므로,
 * 다시 시도하게 두지 않고 사유만 분명히 보여준다(그 앱 개발자가 원인을 찾을 수 있게).
 */
function BadAuthRequest({ reason }: { reason: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <p className="font-semibold text-gray-700">잘못된 로그인 요청입니다.</p>
      <p className="text-sm text-gray-500">{reason}</p>
    </div>
  );
}

/** 로그인된 채로 인증 화면에 온 사용자를 복귀시킨다. 보낼 곳이 없으면 /me. */
function AlreadyLoggedIn() {
  const [params] = useSearchParams();
  const [outcome, setOutcome] = useState<'pending' | 'home' | string>('pending');

  useEffect(() => {
    let alive = true;
    // 형식 오류는 GuestOnly 가 이미 걸렀다. 여기서 실패하는 건 서버가 거절한 경우다
    // (미등록 redirect_uri, 비활성 클라이언트 등). 그건 /me 로 삼키면 안 된다 —
    // 보낸 앱은 코드를 기다리는데 사용자는 엉뚱한 화면에서 이유를 모른다.
    goAfterLogin(readAfterLoginParams(params))
      .then((moved) => {
        if (alive && !moved) setOutcome('home');
      })
      .catch((e: unknown) => {
        if (alive) setOutcome(errorMessage(e, '요청을 처리할 수 없습니다.'));
      });
    return () => {
      alive = false;
    };
  }, [params]);

  // 이동이 결정될 때까지는 화면을 깜빡이지 않는다.
  if (outcome === 'pending') return <FullScreenSpinner />;
  if (outcome === 'home') return <Navigate to="/me" replace />;
  return <BadAuthRequest reason={outcome} />;
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
        {/* 로그아웃 착지점. 자사 앱은 자기가 처리하지 않고 여기로 보낸다(공유 세션이라 한 곳에서). */}
        <Route path="/logout" element={<Logout />} />
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
