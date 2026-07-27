import { create } from 'zustand';
import {
  getMe,
  logout as apiLogout,
  type Me,
  type TokenResponse,
} from '@/shared/api/auth';
import {
  clearMe,
  clearSession,
  getSession,
  hasSessionHint,
  hydrateSession,
  isAccessTokenValid,
  loadMe,
  saveMe,
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
    // ① 로컬 저장 세션. 없으면 ② **로그인 힌트 쿠키가 있을 때만** 공유 refresh 쿠키(.plzhans.com)로 시도.
    //    hans-auth 에서 로그인했으면 여기서 세션을 인지한다(**페이지 이동 없이**). 힌트 없으면 호출 안 함(400 회피).
    let session = await hydrateSession();
    if (!session && hasSessionHint() && (await refreshSession())) {
      session = getSession();
    }
    if (!session) {
      set({ status: 'anonymous', me: null });
      return;
    }
    // access token 이 아직 유효(로컬 exp 검증)하고 프로필 캐시가 있으면 → **서버 0, DB 0** 로 즉시 로그인.
    // 새로고침을 아무리 해도 access 수명 안에서는 서버로 안 간다.
    const cached = loadMe();
    if (isAccessTokenValid(session.accessToken) && cached) {
      set({ status: 'authenticated', me: cached });
      return;
    }
    // access 만료됐거나 프로필 캐시가 없을 때만 서버로 확인.
    // 캐시가 있으면 그걸로 먼저 그려 깜빡임을 없애고, getMe 로 최신값을 덮는다.
    set({ status: 'authenticated', me: cached });
    try {
      const me = await getMe();
      saveMe(me);
      set({ status: 'authenticated', me });
    } catch {
      // access 만료 등 → 쿠키로 한 번 더 시도.
      if (await refreshSession()) {
        try {
          const me = await getMe();
          saveMe(me);
          set({ status: 'authenticated', me });
          return;
        } catch {
          // fallthrough
        }
      }
      await clearSession();
      clearMe();
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
    saveMe(me);
    set({ status: 'authenticated', me });
  },

  signOut: async () => {
    try {
      await apiLogout();
    } catch {
      // 서버 폐기 실패해도 로컬 세션은 비운다.
    }
    await clearSession();
    clearMe();
    set({ status: 'anonymous', me: null });
  },
}));
