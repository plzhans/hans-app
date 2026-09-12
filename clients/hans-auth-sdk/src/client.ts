import { SessionChannel, type SessionChange, type SessionEvent } from './channel';
import { discoverEndpoints, type AuthEndpoints } from './discovery';
import { readClaims, verifyAccessToken, type JwtCheck } from './jwt';
import { withLock } from './lock';
import { createPkceRequest, takeVerifier } from './pkce';
import { TokenStorage, type StoredTokens, type TokenPersistence } from './storage';

export interface AuthClientConfig {
  /** HansApp 웹(로그인 UI) base. 예: https://auth.plzhans.com 또는 http://127.0.0.1:5273 */
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
  /**
   * 저장 키 접두사. **앱마다 반드시 다르게 준다**(예: 'medifinder.auth'). 기본 hansapp.auth
   *
   * 토큰·PKCE·탭 통신 채널 이름이 전부 이 값에서 갈라진다. 쿠키 모드는 포트를 가리지 않아
   * 로컬에서 같은 127.0.0.1 에 뜬 다른 앱과 이름이 겹치면 서로의 세션을 덮어쓴다.
   */
  storageKey?: string;
  /** 토큰을 어디까지 살려 둘지. 기본 'device'(기기에 남김). storage.ts 주석 참고. */
  persistence?: TokenPersistence;
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

/** 저장된 토큰의 상태. 'none' 은 저장된 토큰 자체가 없다는 뜻이다. */
export interface SessionCheck extends Omit<JwtCheck, 'status'> {
  status: JwtCheck['status'] | 'none';
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
  /** 이 탭에서 진행 중인 회전. 뒤따르는 호출은 결과에 편승한다. */
  private refreshing: Promise<boolean> | null = null;
  /** discovery 결과. 한 번만 읽고 promise 를 들고 있어 동시 호출이 겹쳐도 한 번이다. */
  private endpoints: Promise<AuthEndpoints> | null = null;
  /** 같은 세션을 든 탭들에 회전·로그아웃을 알리는 통로. channel.ts 주석 참고. */
  private readonly channel: SessionChannel;
  /**
   * 마지막으로 알던 세션 식별자.
   *
   * 토큰을 비운 **뒤에도** 남는다 — 회전 경합에서 진 탭은 저장소를 비운 상태로 뒤늦게
   * 브로드캐스트를 받는데, 그때 자기 세션이 무엇이었는지 알아야 그 토큰을 받아들일 수 있다.
   */
  private lastSid: number | null = null;
  private readonly listeners = new Set<(event: SessionChange) => void>();

  /**
   * 이 앱이 쓰는 저장 키의 접두사. 토큰·PKCE·탭 통신 채널이 전부 여기서 갈라진다.
   *
   * **앱마다 반드시 달라야 한다.** 로컬은 여러 앱이 같은 127.0.0.1 에 뜨고, 쿠키는 포트를
   * 가리지 않아 옆 앱과 같은 이름을 쓰면 서로의 세션을 덮어쓴다.
   */
  private readonly keyPrefix: string;

  constructor(private readonly config: AuthClientConfig) {
    this.keyPrefix = config.storageKey ?? 'hansapp.auth';
    this.storage = new TokenStorage(this.keyPrefix, config.persistence);
    this.channel = new SessionChannel(`${this.keyPrefix}.session`);
    this.channel.subscribe((event) => void this.receive(event));
  }

  /**
   * 다른 탭에서 세션이 바뀌면 알려준다. 반환값을 호출하면 구독을 해제한다.
   *
   * 'signedOut' 은 **이 탭도 로그아웃됐다**는 뜻이다(같은 세션일 때만 온다) — 화면을 익명으로
   * 되돌려야 한다. 'refreshed' 는 토큰만 갈린 것이라 대개 할 일이 없다.
   */
  onSessionChange(handler: (event: SessionChange) => void): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  /** PKCE verifier 저장 키의 접두사. 흐름마다 state 가 뒤에 붙는다. */
  private get pkcePrefix(): string {
    return `${this.keyPrefix}.pkce.`;
  }

  private get callbackUrl(): string {
    const path = this.config.callbackPath ?? '/auth/callback';
    return `${window.location.origin}${path}`;
  }

  /** 인증 엔드포인트(discovery). 실패해도 관례 경로로 채워져 반드시 성립한다. */
  private resolveEndpoints(): Promise<AuthEndpoints> {
    this.endpoints ??= discoverEndpoints({
      apiBaseUrl: this.config.apiBaseUrl,
      authWebUrl: this.config.authWebUrl,
      cacheKey: `${this.keyPrefix}.discovery`,
    });
    return this.endpoints;
  }

  /**
   * plzhans 로그인 UI 로 전체 페이지 이동한다. 로그인 후 이 앱의 콜백으로 code 가 돌아온다.
   *
   * 이동 **전에** PKCE verifier 를 만들어 보관한다. 전체 페이지 이동이라 JS 힙이 통째로
   * 사라지므로, 메모리에 두면 돌아왔을 때 교환할 수가 없다.
   */
  async login(redirectUri: string = this.callbackUrl): Promise<void> {
    const { authorizationEndpoint } = await this.resolveEndpoints();
    const { state, codeChallenge } = await createPkceRequest(this.pkcePrefix);
    // OAuth2 표준 authorization 요청 파라미터. redirect_uri·response_type=code·PKCE(S256).
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
    });
    window.location.href = `${authorizationEndpoint}?${params.toString()}`;
  }

  /**
   * 콜백 페이지에서 호출한다. URL 의 code 를 토큰으로 교환·저장한다.
   * 신규 소셜(pending)·에러는 그대로 사유를 반환한다(SSO 소비앱은 가입 UI 를 안 그리므로).
   */
  async handleCallback(
    search: string = window.location.search,
    /**
     * fragment(#) 부분. **pending 티켓이 여기 온다** — 그 안에 이메일·이름이 들어 있어
     * 쿼리에 실으면 서버 접속 로그와 Referer 에 남기 때문이다(인증 서버의 withOutcome 참고).
     * fragment 는 서버로 전송되지 않는다.
     */
    hash: string = window.location.hash,
  ): Promise<CallbackResult> {
    const params = new URLSearchParams(search);
    const secret = new URLSearchParams(hash.replace(/^#/, ''));
    const error = params.get('error');
    if (error) return { ok: false, error };
    if (secret.get('pending')) return { ok: false, error: 'pending' };
    const code = params.get('code');
    if (!code) return { ok: false, error: 'no_code' };

    // state 로 이 흐름의 verifier 를 꺼낸다. 없으면 이 브라우저가 시작한 로그인이 아니다 —
    // 남이 심어 놓은 code 를 교환하려는 시도(code injection)일 수 있으므로 여기서 끊는다.
    const codeVerifier = await takeVerifier(this.pkcePrefix, params.get('state'));
    if (!codeVerifier) return { ok: false, error: 'no_verifier' };

    const { tokenEndpoint } = await this.resolveEndpoints();
    const res = await fetch(tokenEndpoint, {
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

  /**
   * 저장된 access token 을 **JWKS 로 검증한다.** 서버를 부르지 않는다.
   *
   * 부팅할 때 화면을 어느 쪽으로 그릴지 여기서 정한다 — 'valid' 면 곧바로 로그인 상태로
   * 그리고, 'expired' 면 refresh 로 살아날 수 있으니 아직 결론을 내지 않으며,
   * 'invalid' 면 손상된 값이라 버린다. 자세한 구분은 jwt.ts 주석 참고.
   */
  async checkAccessToken(): Promise<SessionCheck> {
    const session = await this.getSession();
    if (!session) return { status: 'none' };
    const { jwksUri } = await this.resolveEndpoints();
    return verifyAccessToken(session.accessToken, jwksUri);
  }

  /** 저장된 access token 을 **그대로** 준다. 만료가 임박했는지는 보지 않는다. */
  async getAccessToken(): Promise<string | null> {
    return (await this.getSession())?.accessToken ?? null;
  }

  /**
   * 지금 써도 되는 access token. **만료가 가까우면 먼저 회전시킨다.**
   *
   * 만료된 뒤 401 을 받고 회전하는 길도 있지만(fetchWithAuth), 그 경우 사용자는 왕복을
   * 한 번 더 기다린다. 보내기 전에 남은 수명을 보고 미리 바꾸면 그 왕복이 사라진다.
   *
   * **여유를 두는 이유.** 지금 유효해도 요청이 서버에 닿는 사이 만료될 수 있고, 기기 시계가
   * 조금 어긋나 있을 수도 있다. 그래서 "아직 안 만료됨" 이 아니라 "적어도 이만큼 남음" 을 본다.
   *
   * 회전은 단일 비행 + 탭 간 락으로 묶여 있어(refresh) 동시에 여러 요청이 이 자리를 지나도
   * 실제 호출은 한 번이다.
   *
   * @param minTtlSec 남아 있어야 할 최소 수명(초). 이보다 적게 남았으면 회전시킨다.
   */
  async getFreshAccessToken(minTtlSec = 300): Promise<string | null> {
    const session = await this.getSession();
    if (!session) return null;

    const exp = readClaims(session.accessToken)?.exp;
    // exp 가 없는 토큰은 남은 수명을 알 수 없다. 미리 회전시킬 근거가 없으니 그대로 쓴다.
    if (typeof exp !== 'number') return session.accessToken;
    if (exp * 1000 - Date.now() > minTtlSec * 1000) return session.accessToken;

    // 회전에 실패했다면 세션이 끝난 것이다(SDK 가 저장소를 비웠다).
    if (!(await this.refresh())) return null;
    return (await this.getSession())?.accessToken ?? null;
  }

  /**
   * API 를 호출한다. **토큰 관리는 여기서 끝난다** — 쓰는 쪽은 이 함수만 부르면 된다.
   *
   *   로그인 상태면 access token 을 붙인다. 익명이면 안 붙이고 그대로 보낸다.
   *   보내기 전에 만료가 가까우면 미리 회전시킨다(getFreshAccessToken).
   *   그래도 401 이면 한 번 더 회전시켜 재시도한다 — 서버가 세션을 끊은 경우까지 덮는다.
   *
   * 회전을 밖에서 챙기게 두면 SDK 를 쓰는 앱마다 같은 코드를 다시 쓰게 되고, 한 곳만
   * 빠뜨려도 그 경로에서만 로그아웃되는 버그가 난다.
   *
   * @param pathOrUrl `/users/me` 처럼 apiBaseUrl 기준 경로, 또는 `http…` 로 시작하는 절대 URL.
   */
  async fetchWithAuth(pathOrUrl: string, init: RequestInit = {}): Promise<Response> {
    const url = /^https?:\/\//.test(pathOrUrl)
      ? pathOrUrl
      : `${this.config.apiBaseUrl}${pathOrUrl}`;

    const call = async (): Promise<Response> => {
      const headers = new Headers(init.headers);
      /*
        **브라우저에서 부르는 요청에는 클라이언트 ID 가 있어야 한다.** 서버가 이 값으로
        "등록된 사이트에서 온 호출인가" 를 가리고, 없으면 CORS 단계에서 막는다.

        부르는 쪽이 이미 넣었으면 두 번 정하지 않는다 — 같은 앱이 여러 클라이언트 ID 를
        쓰는 구성(환경별 분리 등)에서 SDK 설정이 호출부를 덮으면 진단하기 어렵다.
      */
      if (!headers.has('X-Client-Id')) headers.set('X-Client-Id', this.config.clientId);
      const token = await this.getFreshAccessToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);
      if (init.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }
      return fetch(url, { ...init, headers });
    };
    const hadToken = (await this.getSession()) !== null;
    const res = await call();
    if (res.status !== 401) return res;

    // 회전에 성공하면 새 토큰으로 한 번 더.
    if (await this.refresh()) return call();

    /*
      회전까지 실패했다 = 세션이 끝났다(만료·서버 폐기). 저장소는 이미 비워졌다.

      **토큰을 들고 있었다면 익명으로 한 번 더 시도한다.** 로그인해야만 열리는 자원이면
      어차피 다시 401 이지만, 누구나 볼 수 있는 자원이면 그대로 열린다 — 세션이 끊겼다고
      병원 목록까지 안 보이는 것은 사용자가 이해할 수 없는 실패다.

      처음부터 익명이었다면 재시도는 같은 요청을 두 번 보내는 것일 뿐이라 하지 않는다.
    */
    return hadToken ? call() : res;
  }

  /**
   * 로그아웃한다. **이 앱에서 나가는 것과 계정 세션을 끊는 것은 다른 일이라 나눠 둔다.**
   *
   *   revokeSession: false (기본)  이 앱의 토큰만 버린다. HansApp 로그인은 그대로다 —
   *                               여기서 나갔다고 다른 서비스까지 로그아웃되면 안 된다.
   *   revokeSession: true          계정의 이 세션까지 폐기한다(다른 기기 목록에서도 사라진다).
   *
   * `DELETE /oauth/logout` 은 쓸 수 없다 — 그쪽은 폐기 대상을 refresh **쿠키**로 정하는데,
   * 외부 앱은 인증 서버와 도메인이 달라 그 쿠키를 실어 보낼 수 없다(CORS 도 credentials 를
   * 주지 않는다). 그래서 access token 의 `sid` 로 내 세션만 지운다.
   *
   * 서버 호출이 실패해도 로컬은 반드시 비운다 — 사용자의 의도는 로그아웃이다.
   */
  async logout({ revokeSession = false }: { revokeSession?: boolean } = {}): Promise<void> {
    const s = await this.getSession();
    const sid = s ? readClaims(s.accessToken)?.sid : undefined;
    if (revokeSession && s && sid) {
      try {
        await this.fetchWithAuth(`/users/me/sessions/${sid}`, { method: 'DELETE' });
      } catch {
        // 네트워크 실패. 아래에서 로컬은 그대로 비운다.
      }
    }
    await this.forget();
    // 저장소를 공유하는 다른 탭도 화면을 내려야 한다(channel.ts 참고).
    if (sid) this.channel.publish({ kind: 'signedOut', sid });
  }

  /**
   * 서버를 부르지 않고 로컬 토큰만 버린다.
   *
   * 손상된 값을 정리할 때 쓴다 — 그 토큰으로는 서버에 무엇도 요청할 수 없으니
   * 세션 폐기를 시도해봐야 401 만 받는다. 정상 로그아웃은 logout() 이다.
   */
  async forget(): Promise<void> {
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
    this.lastSid = readClaims(tokens.accessToken)?.sid ?? this.lastSid;
    await this.storage.save(tokens);
  }

  /** 지금 이 탭의 세션 식별자. 토큰을 비운 뒤에는 마지막으로 알던 값을 쓴다. */
  private async currentSid(): Promise<number | null> {
    const s = await this.getSession();
    return (s ? readClaims(s.accessToken)?.sid : null) ?? this.lastSid;
  }

  /**
   * 다른 탭이 로그아웃했다는 통지를 처리한다. **같은 세션일 때만** 따라 나간다 —
   * 다른 계정으로 따로 로그인한 탭까지 끌고 나가면 안 된다.
   */
  private async receive(event: SessionEvent): Promise<void> {
    const sid = await this.currentSid();
    if (sid == null || sid !== event.sid) return;
    // 저장소(공유 쿠키)는 로그아웃한 탭이 이미 비웠다. 이 탭의 메모리 캐시만 맞춘다.
    await this.forget();
    this.notify(event.kind);
  }

  private notify(event: SessionChange): void {
    for (const listener of this.listeners) listener(event);
  }

  /**
   * 세션을 갱신한다. **회전은 한 번에 하나만** 돈다 — 같은 탭의 동시 호출은 하나로 합치고,
   * 탭 사이는 Web Locks 로 직렬화한다. refresh 가 1회용이라 중복 호출은 그대로 로그아웃이다.
   */
  private refresh(): Promise<boolean> {
    if (this.refreshing) return this.refreshing;
    const run = withLock(`${this.config.clientId}.refresh`, () =>
      this.refreshOnce(),
    );
    this.refreshing = run;
    void run
      .catch(() => false)
      .finally(() => {
        if (this.refreshing === run) this.refreshing = null;
      });
    return run;
  }

  private async refreshOnce(): Promise<boolean> {
    const before = this.cached?.refreshToken;
    // 락을 기다리는 동안 다른 탭이 이미 회전시켰을 수 있다. 캐시 말고 저장소를 다시 읽는다.
    const stored = await this.storage.load();
    if (before && stored && stored.refreshToken !== before) {
      // 남이 해준 새 토큰을 그대로 쓴다. 내 값으로 또 치면 1회용이라 401 이다.
      this.cached = stored;
      return true;
    }
    if (!stored?.refreshToken) return false;

    const { tokenEndpoint } = await this.resolveEndpoints();
    const res = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: stored.refreshToken,
      }),
    });
    if (!res.ok) {
      /*
        내 refresh 값이 거절당했다. **곧바로 저장소를 비우지 않는다.**

        회전은 락으로 직렬화하지만 락이 없는 브라우저도 있고, 그때는 두 탭이 같은 값으로
        동시에 칠 수 있다. 진 쪽이 그대로 저장소를 지우면 **이긴 탭이 방금 넣어 둔 새
        토큰까지 지운다** — 쿠키는 탭이 공유하니 둘 다 로그아웃된다.
        값이 갈렸는지 잠깐 지켜보고, 그대로면 그때 비운다.
      */
      if (await this.awaitReplacement(stored.refreshToken)) return true;
      this.cached = null;
      await this.storage.clear();
      return false;
    }
    await this.store((await res.json()) as TokenResponse);
    return true;
  }

  /** 저장소의 refresh 값이 남의 손에 갈렸는지 잠깐 지켜본다. 갈렸으면 그것을 쓴다. */
  private async awaitReplacement(rejected: string, timeoutMs = 600): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const stored = await this.storage.load();
      if (stored && stored.refreshToken !== rejected) {
        this.cached = stored;
        return true;
      }
    }
    return false;
  }
}

export function createAuthClient(config: AuthClientConfig): HansAppAuthClient {
  return new HansAppAuthClient(config);
}
