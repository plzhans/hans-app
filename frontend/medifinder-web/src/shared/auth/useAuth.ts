import { create } from 'zustand';
import { authClient } from './authClient';
import { getMe, type Me } from './api';
import { clearMe, loadMe, saveMe, saveReturnTo } from './cache';

/**
 * 로그인 상태.
 *
 * **'loading' 이 따로 있는 이유.** 토큰은 로컬에 있고 읽는 데 한 틱이 걸린다. 기본값을
 * 익명으로 두면 로그인한 사용자에게도 매번 로그인 버튼이 한 번 번쩍이고 사용자 메뉴로
 * 바뀐다. 확인이 끝나기 전에는 **아무 쪽도 그리지 않는다**(→ Header 의 자리 표시자).
 */
type Status = 'loading' | 'authenticated' | 'anonymous';

interface AuthState {
  status: Status;
  me: Me | null;
  /** 앱 시작 시 저장된 토큰으로 로그인 상태를 복원한다. */
  bootstrap: () => Promise<void>;
  /** 로그인 UI 로 이동. 돌아올 자리를 기억해 둔다. */
  login: (returnTo?: string) => Promise<void>;
  /** 콜백에서 토큰 교환이 끝난 뒤 상태를 세운다. 내 정보는 뒤따라 채워진다. */
  complete: () => void;
  /** 로그아웃(서버 세션 폐기 + 로컬 정리). */
  logout: () => Promise<void>;
  /** 다른 탭에서 같은 세션이 로그아웃됐다. 서버 호출 없이 화면만 익명으로 되돌린다. */
  signedOutElsewhere: () => void;
  /** 내 정보를 다시 받아온다. 캐시가 비어 있는 화면(마이페이지)이 부른다. */
  reloadMe: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  status: 'loading',
  me: null,

  bootstrap: async () => {
    const { status } = await authClient.checkAccessToken();

    // 저장된 것이 없거나 손상됐다 → 익명. 손상된 값은 남겨둘 이유가 없다.
    if (status === 'none' || status === 'invalid') {
      if (status === 'invalid') await authClient.forget();
      clearMe();
      set({ status: 'anonymous', me: null });
      return;
    }

    /*
      서명·만료가 통과했다 → **캐시로 먼저 그린다.** 서버 확인은 그 뒤에 붙인다.

      토큰이 멀쩡해도 세션은 서버에서 끊겼을 수 있다(다른 기기에서 로그아웃, 관리자 폐기).
      서명만 믿고 끝내면 그 사실이 이 브라우저에 영영 안 닿는다. 반대로 서버 응답을
      기다렸다 그리면 매번 헤더가 비어 있다 — 그래서 그려 놓고 확인한다.

      'expired'·'unverified' 는 로컬에서 결론을 못 내는 상태라 서버 응답까지 기다린다.
    */
    const cached = loadMe();
    if (status === 'valid' && cached) {
      set({ status: 'authenticated', me: cached });
    }

    try {
      const me = await getMe();
      saveMe(me);
      set({ status: 'authenticated', me });
    } catch (error) {
      /*
        **통신 자체가 안 된 것과 거절당한 것을 가른다.** 서명이 통과한 토큰을 들고 있는데
        터널에 들어갔다고 로그아웃시키면 사용자는 영문을 모른 채 다시 로그인해야 한다.
        HTTP 상태가 없으면(네트워크 오류) 판단을 미루고 지금 상태를 유지한다.
      */
      const httpStatus = (error as { status?: number }).status;
      if (status === 'valid' && httpStatus === undefined) {
        set({ status: 'authenticated', me: cached });
        return;
      }
      // 401(세션 폐기·refresh 실패) 이면 SDK 가 이미 저장소를 비웠다. 화면만 맞춘다.
      clearMe();
      set({ status: 'anonymous', me: null });
    }
  },

  login: async (returnTo = `${window.location.pathname}${window.location.search}`) => {
    saveReturnTo(returnTo);
    await authClient.login();
  },

  complete: () => {
    /*
      **내 정보를 기다리지 않는다.** 토큰을 손에 쥔 시점에 로그인은 이미 성립했고,
      여기서 기다리면 콜백 화면에 왕복이 하나 더 붙는다 — 사용자에게는 그만큼 빈 화면이다.
      이름은 캐시로 먼저 그리고, 서버 값이 오면 갈아 끼운다.
    */
    set({ status: 'authenticated', me: loadMe() });
    void getMe()
      .then((me) => {
        saveMe(me);
        set({ me });
      })
      .catch(() => {
        // 다음 부팅의 bootstrap 이 다시 맞춘다. 로그인 자체는 성립했다.
      });
  },

  logout: async () => {
    /*
      **MediFinder 에서만 나간다.** HansApp 계정 세션은 건드리지 않는다(revokeSession 기본값).

      계정은 여러 서비스가 함께 쓰는 것이라, 여기서 로그아웃한 사람이 포털이나 다른 앱에서까지
      튕겨 나가면 그건 사용자가 시킨 일이 아니다. 이 브라우저에 보관하던 토큰만 지우면
      이 앱에서는 완전히 로그아웃된 것과 같다 — 남은 토큰이 없으니 아무것도 못 한다.
    */
    await authClient.logout();
    clearMe();
    set({ status: 'anonymous', me: null });
  },

  reloadMe: async () => {
    try {
      const me = await getMe();
      saveMe(me);
      set({ me });
    } catch {
      // 실패해도 로그인 상태는 유지한다. 화면이 캐시로 그리거나 빈 자리를 보여줄 뿐이다.
    }
  },

  signedOutElsewhere: () => {
    // 토큰은 SDK 가 이미 비웠다(같은 세션임을 확인한 뒤에만 온다).
    clearMe();
    set({ status: 'anonymous', me: null });
  },
}));
