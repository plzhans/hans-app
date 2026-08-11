import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { useAuthStore } from '@/shared/auth/authStore';
import Login from '@/features/auth/pages/Login';
import ChangePassword from '@/features/auth/pages/ChangePassword';
import ForgotPassword from '@/features/auth/pages/ForgotPassword';
import ResetPassword from '@/features/auth/pages/ResetPassword';
import Me from '@/features/auth/pages/Me';
import Users from '@/features/users/pages/Users';
import UserDetail from '@/features/users/pages/UserDetail';
import UserAuthLogs from '@/features/users/pages/UserAuthLogs';
import Apps from '@/features/apps/pages/Apps';
import AppDetail from '@/features/apps/pages/AppDetail';
import MailSettings from '@/features/settings/pages/MailSettings';
import IntegrationSettings from '@/features/settings/pages/IntegrationSettings';
import LlmSettings from '@/features/settings/pages/LlmSettings';
import Admins from '@/features/admins/pages/Admins';
import AdminDetail from '@/features/admins/pages/AdminDetail';
import AdminActionLogs from '@/features/admins/pages/AdminActionLogs';
import AuthLogs from '@/features/logs/pages/AuthLogs';
import LlmUsageLogs from '@/features/logs/pages/LlmUsageLogs';

function FullScreenMessage({ children }: { children: string }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-gray-400">
      {children}
    </div>
  );
}

/**
 * 서버에 닿지 못했을 때.
 *
 * **스스로 다시 시도한다.** 개발 중 재시작이나 배포로 잠깐 내려간 경우가 대부분이라,
 * 사람이 새로고침을 누르기 전에 대개 돌아온다. 버튼은 그보다 오래 걸릴 때를 위한 것이다.
 */
function Offline({ onRetry }: { onRetry: () => Promise<void> }) {
  useEffect(() => {
    const timer = setInterval(() => void onRetry(), 3000);
    return () => clearInterval(timer);
  }, [onRetry]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <p className="text-sm text-gray-500">서버에 연결할 수 없습니다.</p>
      <p className="text-xs text-gray-400">
        로그아웃된 것이 아닙니다 — 연결되면 이어서 진행합니다.
      </p>
      <button
        type="button"
        onClick={() => void onRetry()}
        className="mt-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
      >
        지금 다시 시도
      </button>
    </div>
  );
}

/**
 * 로그인 여부로 화면을 가른다.
 *
 * **개별 라우트를 감싸는 대신 Routes 전체를 가른다.** 관리자는 로그인 화면 하나를 빼면
 * 전부 보호 대상이라, 라우트마다 감싸면 새 화면을 추가할 때 빠뜨리기 쉽다 — 빠뜨려도
 * 화면은 멀쩡히 뜨고 API 만 401 을 내므로 눈치채기 어렵다.
 *
 * **이 가드는 UX 일 뿐 방어가 아니다.** 실제 차단은 서버의 AdminAuthGuard 가 한다.
 */
export default function App() {
  const status = useAuthStore((s) => s.status);
  const bootstrap = useAuthStore((s) => s.bootstrap);

  // 앱을 열 때 한 번. access token 은 메모리라 새로고침마다 여기서 다시 세운다.
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (status === 'loading') {
    return <FullScreenMessage>불러오는 중…</FullScreenMessage>;
  }

  /*
    **서버에 닿지 못한 상태다. 로그아웃이 아니다.** 로그인 화면을 띄우면 세션이 멀쩡한데도
    비밀번호를 다시 치게 되므로, 여기서 기다렸다가 서버가 돌아오면 그대로 이어 붙인다.
  */
  if (status === 'offline') {
    return <Offline onRetry={bootstrap} />;
  }

  return (
    <BrowserRouter>
      {status === 'anonymous' ? (
        <Routes>
          <Route path="/login" element={<Login />} />
          {/* 비밀번호 찾기. **로그인 전에만 갈 수 있는 곳이다.** */}
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          {/* 그 밖에는 어디로 가든 로그인 화면이다. */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      ) : status === 'mustChange' ? (
        /*
          **비밀번호를 바꾸기 전에는 이 화면 하나뿐이다.**
          주소를 직접 쳐도 여기로 돌아온다. 화면을 뚫어도 서버가 403 을 주므로
          이 라우팅은 편의(막다른 길에서 헤매지 않게)이지 방어가 아니다.
        */
        <Routes>
          <Route path="/password" element={<ChangePassword />} />
          <Route path="*" element={<Navigate to="/password" replace />} />
        </Routes>
      ) : (
        <Routes>
          <Route path="/users" element={<Users />} />
          <Route path="/users/:id" element={<UserDetail />} />
          {/* 회원 상세의 탭 하나. URL 로 갈라 링크·새로고침이 살아 있게 한다. */}
          <Route path="/users/:id/auth-logs" element={<UserAuthLogs />} />
          <Route path="/apps" element={<Apps />} />
          <Route path="/apps/:id" element={<AppDetail />} />
          {/* 같은 화면이다. clientId 가 있으면 그 위에 모달이 뜬다. */}
          <Route path="/apps/:id/clients/:clientId" element={<AppDetail />} />
          {/* 로그 구역. 대상을 가리지 않고 기간으로 훑는 화면들이 여기 붙는다. */}
          <Route path="/logs/auth" element={<AuthLogs />} />
          <Route path="/logs/llm" element={<LlmUsageLogs />} />
          <Route path="/settings/mail" element={<MailSettings />} />
          <Route
            path="/settings/integrations"
            element={<IntegrationSettings />}
          />
          <Route path="/settings/llm" element={<LlmSettings />} />
          {/* 콘솔 자신을 다루는 구역. 이 콘솔에 로그인할 수 있는 계정들이다. */}
          <Route path="/admins" element={<Admins />} />
          <Route path="/admins/:id" element={<AdminDetail />} />
          {/* 관리자 상세의 탭 하나. URL 로 갈라 링크·새로고침이 살아 있게 한다. */}
          <Route path="/admins/:id/action-logs" element={<AdminActionLogs />} />
          <Route path="/me" element={<Me />} />
          {/* 강제 변경 때와 같은 화면이다. 어느 쪽인지는 status 를 보고 스스로 정한다. */}
          <Route path="/password" element={<ChangePassword />} />
          {/* 로그인한 뒤 /login 으로 오면 갈 곳이 없다. 목록으로 보낸다. */}
          <Route path="*" element={<Navigate to="/users" replace />} />
        </Routes>
      )}
    </BrowserRouter>
  );
}
