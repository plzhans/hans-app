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
    // **힌트 쿠키가 이 오리진 토큰의 유효성을 결정한다.**
    // 로그아웃은 서버가 `.plzhans.com` 쿠키를 지우는 것으로 끝나는데, 각 앱의 localStorage
    // 는 origin 격리라 아무도 대신 못 지운다. 그래서 "힌트가 없으면 내 access token 도
    // 무효" 로 봐야 한다 — 안 그러면 다른 앱에서 로그아웃한 뒤에도 여기선 만료 전 JWT 로
    // 로그인 상태라 우기게 되고, 서로 상대에게 떠넘기며 무한 왕복한다.
    const hint = hasSessionHint();
    let session = await hydrateSession();
    if (session && !hint) {
      await clearSession();
      clearMe();
      session = null;
    }
    // 저장소가 비었어도 힌트가 있으면 공유 refresh 쿠키로 세션을 세운다 — 포털에서
    // 로그인했으면 access token 은 그쪽에만 있고 공유되는 건 쿠키뿐이다.
    if (!session && hint && (await tryRefresh().catch(() => false))) {
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
