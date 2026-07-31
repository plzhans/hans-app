import { create } from 'zustand';
import {
  getMe,
  logout as apiLogout,
  type Me,
  type TokenResponse,
} from '@/shared/api/auth';
import { tryRefresh } from '@/shared/api/client';
import { publishAuth, type AuthEvent } from '@/shared/auth/authChannel';
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
  /** 다른 탭에서 온 인증 이벤트를 반영한다(App 이 구독해 연결). */
  syncFromOtherTab: (event: AuthEvent) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'loading',
  me: null,

  bootstrap: async () => {
    // ① 로컬 저장 세션. 없으면 ② **로그인 힌트 쿠키가 있을 때만** 공유 refresh 쿠키(.plzhans.com)로 시도.
    //    포털에서 로그인했으면 access token 은 그쪽 저장소에만 있고 공유되는 건 쿠키뿐이라,
    //    저장소가 비었다고 익명이 아니다. 힌트가 없으면 호출하지 않는다(로그아웃 상태의 400 회피).
    let session = await hydrateSession();
    if (!session && hasSessionHint() && (await tryRefresh())) {
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
    // 캐시가 있으면 그걸로 먼저 그려 깜빡임을 없애고, getMe 로 최신값을 덮는다.
    set({ status: 'authenticated', me: cached });
    try {
      const me = await getMe();
      saveMe(me);
      set({ status: 'authenticated', me });
    } catch {
      // 토큰이 만료·무효이고 refresh 도 실패 → 익명 처리(client 가 세션을 이미 비웠다).
      await clearSession();
      clearMe();
      set({ status: 'anonymous', me: null });
    }
  },

  authenticate: async (tokens) => {
    // access token 만 보관한다. refresh 는 httpOnly 쿠키(백엔드가 세팅)로만 오간다.
    await setSession({ accessToken: tokens.accessToken });
    const me = await getMe();
    saveMe(me);
    set({ status: 'authenticated', me });
    publishAuth('login');
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
    // 서버 세션이 폐기됐으니 다른 탭이 로그인 화면을 계속 띄우고 있으면 안 된다.
    publishAuth('logout');
  },

  syncFromOtherTab: async (event) => {
    if (event === 'logout') {
      await clearSession();
      clearMe();
      set({ status: 'anonymous', me: null });
      return;
    }
    // login·refreshed: 저장소에 새 access token 이 들어와 있다. 메모리 캐시를 맞춘다.
    const session = await hydrateSession();
    if (!session) {
      set({ status: 'anonymous', me: null });
      return;
    }
    // 'refreshed' 는 토큰만 바뀐 것이라 이미 인증 상태면 프로필을 다시 부를 필요가 없다.
    const alreadyIn = useAuthStore.getState().status === 'authenticated';
    if (event === 'refreshed' && alreadyIn) return;
    const cached = loadMe();
    if (isAccessTokenValid(session.accessToken) && cached) {
      set({ status: 'authenticated', me: cached });
      return;
    }
    try {
      const me = await getMe();
      saveMe(me);
      set({ status: 'authenticated', me });
    } catch {
      await clearSession();
      clearMe();
      set({ status: 'anonymous', me: null });
    }
  },
}));
