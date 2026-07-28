import { createPkceRequest, takeVerifier } from './pkce';
import { TokenStorage, type StoredTokens } from './storage';

export interface AuthClientConfig {
  /** HansApp 웹(로그인 UI) base. 예: https://plzhans.com 또는 http://127.0.0.1:5273 */
  authWebUrl: string;
  /** 인증 API base. 예: https://api.plzhans.com 또는 http://127.0.0.1:3000 */
  apiBaseUrl: string;
  /**
   * 이 앱의 공개 클라이언트 ID(hansapp 앱 콘솔/CLI 에서 발급, 예: cl_fixed_medifinder).
   *
   * 로그인 URL 에 실려 나가고, 서버가 이 값으로 return_to 가 등록된 리디렉션 URI 인지 검증한 뒤
   * 발급하는 인가코드에 박는다. 토큰 교환 때 그 값으로 요청 Origin 을 대조하므로 **필수**다.
   * 비밀이 아니라 번들에 노출돼도 된다 — 등록되지 않은 출처에서는 어차피 통하지 않는다.
   */
  clientId: string;
  /** 이 앱(클라이언트)에서 code 를 받을 콜백 경로. 기본 /auth/callback */
  callbackPath?: string;
  /** 토큰 저장 키(앱마다 격리). 기본 hansapp.auth.tokens */
  storageKey?: string;
}

/** /oauth/token 응답. */
interface TokenResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: string;
}

export interface CallbackResult {
  ok: boolean;
  /** 실패/보류 사유. 'no_code' | 'no_verifier' | 'email_exists' | 'pending' | ... */
  error?: string;
}

/**
 * HansApp 로그인 SDK 클라이언트.
 *
 * 흐름: login() → plzhans 로그인 UI 로 이동 → 로그인 후 이 앱의 콜백으로 code 복귀
 *      → handleCallback() 이 code 를 토큰으로 교환·저장 → fetchWithAuth()/getAccessToken() 사용.
 */
export class HansAppAuthClient {
  private readonly storage: TokenStorage;
  private cached: StoredTokens | null = null;

  constructor(private readonly config: AuthClientConfig) {
    this.storage = new TokenStorage(config.storageKey ?? 'hansapp.auth.tokens');
  }

  private get callbackUrl(): string {
    const path = this.config.callbackPath ?? '/auth/callback';
    return `${window.location.origin}${path}`;
  }

  /**
   * plzhans 로그인 UI 로 전체 페이지 이동한다. 로그인 후 이 앱의 콜백으로 code 가 돌아온다.
   *
   * 이동 **전에** PKCE verifier 를 만들어 보관한다. 전체 페이지 이동이라 JS 힙이 통째로
   * 사라지므로, 메모리에 두면 돌아왔을 때 교환할 수가 없다.
   */
  async login(redirectUri: string = this.callbackUrl): Promise<void> {
    const { state, codeChallenge } = await createPkceRequest();
    // OAuth2 표준 authorization 요청 파라미터. redirect_uri·response_type=code·PKCE(S256).
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
    });
    window.location.href = `${this.config.authWebUrl}/login?${params.toString()}`;
  }

  /**
   * 콜백 페이지에서 호출한다. URL 의 code 를 토큰으로 교환·저장한다.
   * 신규 소셜(pending)·에러는 그대로 사유를 반환한다(SSO 소비앱은 가입 UI 를 안 그리므로).
   */
  async handleCallback(search: string = window.location.search): Promise<CallbackResult> {
    const params = new URLSearchParams(search);
    const error = params.get('error');
    if (error) return { ok: false, error };
    if (params.get('pending')) return { ok: false, error: 'pending' };
    const code = params.get('code');
    if (!code) return { ok: false, error: 'no_code' };

    // state 로 이 흐름의 verifier 를 꺼낸다. 없으면 이 브라우저가 시작한 로그인이 아니다 —
    // 남이 심어 놓은 code 를 교환하려는 시도(code injection)일 수 있으므로 여기서 끊는다.
    const codeVerifier = await takeVerifier(params.get('state'));
    if (!codeVerifier) return { ok: false, error: 'no_verifier' };

    const res = await fetch(`${this.config.apiBaseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        code_verifier: codeVerifier,
      }),
    });
    if (!res.ok) return { ok: false, error: `exchange_failed_${res.status}` };
    await this.store((await res.json()) as TokenResponse);
    return { ok: true };
  }

  async isAuthenticated(): Promise<boolean> {
    return (await this.getSession()) != null;
  }

  /** 저장된 access token. 없으면 null. 만료 검증은 fetchWithAuth 의 401 재시도에 맡긴다. */
  async getAccessToken(): Promise<string | null> {
    return (await this.getSession())?.accessToken ?? null;
  }

  /** access token 을 붙여 API 를 호출한다. 401 이면 refresh 후 1회 재시도. */
  async fetchWithAuth(path: string, init: RequestInit = {}): Promise<Response> {
    const call = async (): Promise<Response> => {
      const headers = new Headers(init.headers);
      const s = await this.getSession();
      if (s) headers.set('Authorization', `Bearer ${s.accessToken}`);
      if (init.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }
      return fetch(`${this.config.apiBaseUrl}${path}`, { ...init, headers });
    };
    let res = await call();
    if (res.status === 401 && (await this.refresh())) {
      res = await call();
    }
    return res;
  }

  async logout(): Promise<void> {
    const s = await this.getSession();
    if (s) {
      try {
        await fetch(`${this.config.apiBaseUrl}/oauth/logout`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${s.accessToken}` },
        });
      } catch {
        // 서버 폐기 실패해도 로컬은 비운다.
      }
    }
    this.cached = null;
    await this.storage.clear();
  }

  // ---- 내부 ----

  private async getSession(): Promise<StoredTokens | null> {
    if (!this.cached) this.cached = await this.storage.load();
    return this.cached;
  }

  private async store(t: TokenResponse): Promise<void> {
    const tokens: StoredTokens = {
      accessToken: t.accessToken,
      refreshToken: t.refreshToken,
      refreshExpiresAt: t.refreshExpiresAt,
    };
    this.cached = tokens;
    await this.storage.save(tokens);
  }

  private async refresh(): Promise<boolean> {
    const s = await this.getSession();
    if (!s?.refreshToken) return false;
    const res = await fetch(`${this.config.apiBaseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: s.refreshToken,
      }),
    });
    if (!res.ok) {
      this.cached = null;
      await this.storage.clear();
      return false;
    }
    await this.store((await res.json()) as TokenResponse);
    return true;
  }
}

export function createAuthClient(config: AuthClientConfig): HansAppAuthClient {
  return new HansAppAuthClient(config);
}
