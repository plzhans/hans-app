import { create } from 'zustand';
import {
  getMe,
  logout as apiLogout,
  type Me,
  type TokenResponse,
} from '@/shared/api/auth';
import {
  clearSession,
  getSession,
  hydrateSession,
  setSession,
} from '@/shared/api/session';
import { refreshSession } from '@/shared/api/client';

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
    // ① 로컬 저장 세션. 없으면 ② **1st-party 공유 refresh 쿠키(.plzhans.com)** 로 silent 시도 —
    //    hans-auth 에서 로그인했으면 여기서 세션을 인지한다(**페이지 이동 없이** 로그인 표시). 구글식 SSO.
    let session = await hydrateSession();
    if (!session && (await refreshSession())) {
      session = getSession();
    }
    if (!session) {
      set({ status: 'anonymous', me: null });
      return;
    }
    // 낙관적으로 즉시 로그인 상태로 표시(새로고침 깜빡임 방지). me 는 백그라운드로 채운다.
    set({ status: 'authenticated', me: null });
    try {
      const me = await getMe();
      set({ status: 'authenticated', me });
    } catch {
      // access 만료 등 → 쿠키로 한 번 더 시도.
      if (await refreshSession()) {
        try {
          const me = await getMe();
          set({ status: 'authenticated', me });
          return;
        } catch {
          // fallthrough
        }
      }
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
