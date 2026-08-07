import { create } from 'zustand';

import {
  changePassword as apiChangePassword,
  getMe,
  logout as apiLogout,
  login as apiLogin,
  type AdminMe,
} from '@/shared/api/auth';
import { refreshSession } from '@/shared/api/client';
import {
  clearAccessToken,
  hasSessionHint,
  setAccessToken,
} from '@/shared/api/session';

/**
 * `mustChange` 는 로그인은 됐지만 **비밀번호를 바꾸기 전까지 아무것도 못 하는** 상태다.
 * 그 상태에서 업무 API 를 부르면 서버가 403 을 준다.
 */
type Status = 'loading' | 'authenticated' | 'mustChange' | 'anonymous';

interface AuthState {
  status: Status;
  me: AdminMe | null;
  bootstrap: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  changePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<void>;
  signOut: () => Promise<void>;
}

/**
 * 로그인 상태.
 *
 * **공개 콘솔(hansapp-web)의 authStore 보다 한참 단순하다.** 그쪽은 여러 오리진이 하나의
 * 세션을 나눠 쓰느라 탭 간 동기화(BroadcastChannel)·쿠키 감시·프로필 캐시가 필요했다.
 * 관리자는 오리진이 하나뿐이고 소셜도 없어서 그 장치들이 전부 필요 없다.
 */
export const useAuthStore = create<AuthState>((set) => ({
  status: 'loading',
  me: null,

  /**
   * 앱을 열 때 한 번.
   *
   * access token 은 메모리에만 있어 새로고침하면 사라진다. 그래서 **항상 힌트 쿠키부터
   * 본다** — 있으면 refresh 로 세션을 다시 세우고, 없으면 곧장 익명이다.
   */
  bootstrap: async () => {
    if (!hasSessionHint()) {
      set({ status: 'anonymous', me: null });
      return;
    }

    if (!(await refreshSession())) {
      set({ status: 'anonymous', me: null });
      return;
    }

    try {
      // /auth/me 는 변경 강제 상태에서도 열려 있다(서버가 그렇게 표시해 두었다).
      const me = await getMe();
      set({
        status: me.mustChangePassword ? 'mustChange' : 'authenticated',
        me,
      });
    } catch {
      // 갱신은 됐는데 내 정보를 못 읽는다 = 계정이 사라졌거나 막혔다.
      clearAccessToken();
      set({ status: 'anonymous', me: null });
    }
  },

  signIn: async (email, password) => {
    const tokens = await apiLogin(email, password);
    setAccessToken(tokens.accessToken);
    const me = await getMe();
    set({
      status: tokens.mustChangePassword ? 'mustChange' : 'authenticated',
      me,
    });
  },

  /**
   * 비밀번호 변경. 서버가 **기존 세션을 전부 끊고 새 세션을 준다** —
   * 응답의 새 access token 으로 갈아 끼워야 이어서 쓸 수 있다.
   */
  changePassword: async (currentPassword, newPassword) => {
    const tokens = await apiChangePassword(currentPassword, newPassword);
    setAccessToken(tokens.accessToken);
    const me = await getMe();
    set({ status: 'authenticated', me });
  },

  signOut: async () => {
    try {
      await apiLogout();
    } catch {
      // 통신 실패여도 로컬 정리는 무조건 한다.
    }
    clearAccessToken();
    set({ status: 'anonymous', me: null });
  },
}));
