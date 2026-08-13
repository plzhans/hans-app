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
import { publishAuth, type AuthEvent } from '@/shared/auth/authChannel';

type Status = 'loading' | 'authenticated' | 'anonymous';

interface AuthState {
  status: Status;
  me: Me | null;
  /** 부팅 시 저장된 토큰을 복원하고 내 정보를 조회한다. */
  bootstrap: () => Promise<void>;
  /** 로그인/가입/소셜 성공 시 토큰을 저장하고 인증 상태로 전환한다. */
  authenticate: (tokens: TokenResponse) => Promise<void>;
  /** 로그아웃: 세션 폐기 + 익명 전환. **어떤 경우에도 로컬은 비운다.** */
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
    // 저장소가 비었어도 힌트가 있으면 공유 refresh 쿠키로 세션을 세운다 — 인증웹에서
    // 로그인했으면 여기서 페이지 이동 없이 세션을 인지한다.
    if (!session && hint && (await refreshSession().catch(() => false))) {
      session = getSession();
    }
    if (!session) {
      set({ status: 'anonymous', me: null });
      return;
    }
    /*
      **캐시로 먼저 그리고, 그다음 서버에 확인한다.**

      전에는 access token 의 exp 만 로컬에서 보고(isAccessTokenValid) 캐시가 있으면 여기서
      끝냈다 — 서버를 한 번도 안 불렀다. 그래서 세션이 서버에서 폐기돼도(관리자 로그아웃,
      전체 로그아웃, 비밀번호 재설정) 그 사실이 이 브라우저에 닿을 길이 없었고, 토큰이
      만료될 때까지 최대 한 시간 로그인 상태로 남았다.

      **깜빡임은 그대로 없다.** 캐시가 있으면 그것으로 즉시 그리고, 확인은 그 뒤에 붙는다 —
      바뀐 것은 "확인을 아예 안 하던 것" 이 "그려 놓고 확인하는 것" 이 된 점뿐이다.

      실시간까지는 가지 않는다. 세션이 도중에 끊기면 다음 새로고침에 정리된다 — 다른
      사이트들도 그렇게 동작하고, 그 이상을 하려면 유휴 탭까지 주기적으로 서버를 때려야 한다.
    */
    const cached = loadMe();
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
    // access token 만 보관한다. refresh 는 httpOnly 쿠키(백엔드가 세팅)로만 오간다.
    await setSession(tokens.accessToken);
    const me = await getMe();
    saveMe(me);
    set({ status: 'authenticated', me });
    publishAuth('login');
  },

  signOut: async () => {
    try {
      await apiLogout();
    } catch {
      // 네트워크 실패 등. 서버는 자격증명 없이도 쿠키를 지우므로 여기 오는 건 통신 자체가
      // 안 된 경우다. 그래도 **로컬 정리와 통지는 무조건 한다** — 사용자 의도는 로그아웃이다.
    }
    await clearSession();
    clearMe();
    set({ status: 'anonymous', me: null });
    // 서버 세션이 폐기됐으니 다른 탭이 로그인 상태를 계속 보여주면 안 된다.
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
    if (isAccessTokenValid(session) && cached) {
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
