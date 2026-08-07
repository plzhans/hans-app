import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { useAuthStore } from '@/shared/auth/authStore';
import Login from '@/features/auth/pages/Login';
import ChangePassword from '@/features/auth/pages/ChangePassword';
import Me from '@/features/auth/pages/Me';
import Users from '@/features/users/pages/Users';
import UserDetail from '@/features/users/pages/UserDetail';
import Apps from '@/features/apps/pages/Apps';
import AppDetail from '@/features/apps/pages/AppDetail';

function FullScreenMessage({ children }: { children: string }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-gray-400">
      {children}
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

  return (
    <BrowserRouter>
      {status === 'anonymous' ? (
        <Routes>
          <Route path="/login" element={<Login />} />
          {/* 로그인 전에는 어디로 가든 로그인 화면이다. */}
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
          <Route path="/apps" element={<Apps />} />
          <Route path="/apps/:id" element={<AppDetail />} />
          {/* 같은 화면이다. clientId 가 있으면 그 위에 모달이 뜬다. */}
          <Route path="/apps/:id/clients/:clientId" element={<AppDetail />} />
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
