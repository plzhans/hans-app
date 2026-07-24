import { create } from 'zustand';
import { authClient } from './authClient';

interface AuthState {
  ready: boolean;
  authenticated: boolean;
  /** 앱 시작 시 저장된 토큰으로 로그인 상태를 복원한다. */
  bootstrap: () => Promise<void>;
  /** plzhans 로그인 UI 로 이동. */
  login: () => Promise<void>;
  /** 로그아웃(세션 폐기 + 로컬 토큰 삭제). */
  logout: () => Promise<void>;
  setAuthenticated: (v: boolean) => void;
}

export const useAuth = create<AuthState>((set) => ({
  ready: false,
  authenticated: false,
  bootstrap: async () => {
    const authed = await authClient.isAuthenticated();
    set({ ready: true, authenticated: authed });
  },
  login: () => authClient.login(),
  logout: async () => {
    await authClient.logout();
    set({ authenticated: false });
  },
  setAuthenticated: (v) => set({ authenticated: v }),
}));
