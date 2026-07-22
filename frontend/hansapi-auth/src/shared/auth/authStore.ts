import { create } from 'zustand';
import {
  getMe,
  logout as apiLogout,
  type Me,
  type TokenResponse,
} from '@/shared/api/auth';
import {
  clearSession,
  hydrateSession,
  setSession,
} from '@/shared/api/session';

type Status = 'loading' | 'authenticated' | 'anonymous';

interface AuthState {
  status: Status;
  me: Me | null;
  /** 부팅 시 저장된 토큰을 복원하고 내 정보를 조회한다. */
  bootstrap: () => Promise<void>;
  /** 로그인/가입/소셜 성공 시 토큰을 저장하고 인증 상태로 전환한다. */
  authenticate: (tokens: TokenResponse) => Promise<void>;
  /** 로그아웃: 세션 폐기 + 익명 전환. */
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'loading',
  me: null,

  bootstrap: async () => {
    const session = await hydrateSession();
    if (!session) {
      set({ status: 'anonymous', me: null });
      return;
    }
    try {
      const me = await getMe();
      set({ status: 'authenticated', me });
    } catch {
      // 토큰이 만료·무효이고 refresh 도 실패 → 익명 처리(client 가 세션을 이미 비웠다).
      await clearSession();
      set({ status: 'anonymous', me: null });
    }
  },

  authenticate: async (tokens) => {
    await setSession({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      refreshExpiresAt: tokens.refreshExpiresAt,
    });
    const me = await getMe();
    set({ status: 'authenticated', me });
  },

  signOut: async () => {
    try {
      await apiLogout();
    } catch {
      // 서버 폐기 실패해도 로컬 세션은 비운다.
    }
    await clearSession();
    set({ status: 'anonymous', me: null });
  },
}));
