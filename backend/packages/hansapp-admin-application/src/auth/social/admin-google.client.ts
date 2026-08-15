import { Injectable } from '@nestjs/common';
import { NotFoundError } from '@hansapp/common';
import { AdminErrorCode, AdminGoogleSignInFailedError } from '../../error';

import { SettingCache } from '../../setting/setting-cache.service';

/** 인가 화면(브라우저를 여기로 보낸다). */
const AUTHORIZE_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
/** 인가코드를 토큰으로 바꾸는 곳(서버끼리 부른다). */
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

/** 토큰 교환이 늦어질 때 요청을 붙잡고 있지 않는다. 사람이 화면 앞에서 기다리는 구간이다. */
const TIMEOUT_MS = 10_000;

/** 구글이 확인해 준 신원. 우리가 쓰는 값만 남긴다. */
export interface AdminGoogleProfile {
  /** OIDC subject. 바뀌지 않는 식별자라 **이 값이 신원이다**. */
  readonly providerId: string;
  readonly email: string | null;
  /** 구글이 이 이메일을 검증했는가(email_verified). */
  readonly emailVerified: boolean;
  readonly name: string | null;
}

/**
 * 관리자 콘솔용 구글 OAuth 클라이언트.
 *
 * **passport 를 쓰지 않는다.** 공개 API 쪽은 provider 가 넷이라 전략 계층이 값을 하지만,
 * 여기는 구글 하나이고 필요한 것도 인가 URL 을 만드는 일과 코드를 한 번 교환하는 일뿐이다.
 * passport 를 끼우면 요청마다 전략을 만들어 넘기는 우회(자격증명이 DB 에 있어서 부팅 때
 * 등록할 수 없다)와 express 의존이 따라오는데, 그만큼의 값이 없다.
 *
 * **자격증명은 서비스 로그인과 갈라 쓴다**(`admin.google.*`). 승인된 리디렉션 URI 목록이 곧
 * 로그인 입구라, 한 클라이언트에 둘을 얹으면 서비스 쪽 키를 만지는 일이 관리자 콘솔 입구를
 * 만지는 일이 된다.
 */
@Injectable()
export class AdminGoogleClient {
  constructor(private readonly settings: SettingCache) {}

  /** 자격증명이 채워져 있는가. 로그인 화면이 구글 버튼을 그릴지 정하는 데 쓴다. */
  async isConfigured(): Promise<boolean> {
    const { clientId, clientSecret } = await this.readCredentials();
    return !!clientId && !!clientSecret;
  }

  /**
   * 브라우저를 보낼 인가 URL.
   *
   * `prompt=select_account` 로 **매번 계정 선택 화면**을 강제한다. 기본값이면 구글에 이미
   * 로그인돼 있을 때 계정 선택 없이 그대로 돌아와, 공용 PC 에서 앞사람 계정으로 들어가진다.
   */
  async authorizeUrl(input: { redirectUri: string; state: string }): Promise<string> {
    const { clientId } = await this.requireCredentials();
    const query = new URLSearchParams({
      client_id: clientId,
      redirect_uri: input.redirectUri,
      response_type: 'code',
      // openid 가 있어야 id_token 이 온다 — 신원(sub·email)을 그 안에서 읽는다.
      scope: 'openid email profile',
      state: input.state,
      prompt: 'select_account',
    });
    return `${AUTHORIZE_ENDPOINT}?${query.toString()}`;
  }

  /**
   * 인가코드를 신원으로 바꾼다.
   *
   * **redirectUri 는 인가 요청 때와 글자 하나까지 같아야 한다** — 구글이 대조한다.
   * 그래서 두 번 다 같은 방식(요청이 들어온 호스트)으로 만든다.
   */
  async exchange(code: string, redirectUri: string): Promise<AdminGoogleProfile> {
    const { clientId, clientSecret } = await this.requireCredentials();

    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      /*
        **응답 본문을 그대로 내보내지 않는다.** 여기에는 client_id 가 섞여 오고, 사람에게
        보여 줄 만한 문장도 아니다. 사유는 로그에서 본다.
      */
      throw new AdminGoogleSignInFailedError();
    }

    const token = (await response.json()) as { id_token?: string };
    if (!token.id_token) {
      throw new AdminGoogleSignInFailedError();
    }
    return decodeIdToken(token.id_token);
  }

  private async readCredentials(): Promise<{ clientId: string; clientSecret: string }> {
    return {
      clientId: (await this.settings.getString('admin.google.clientId')) ?? '',
      clientSecret: (await this.settings.getString('admin.google.clientSecret')) ?? '',
    };
  }

  /**
   * @throws NotFoundException 자격증명이 없을 때. **404 다** — 설정하지 않은 기능은
   *   "실패" 가 아니라 "없는 경로" 로 답한다(공개 API 의 소셜 경로와 같은 규칙이다).
   */
  private async requireCredentials(): Promise<{ clientId: string; clientSecret: string }> {
    const credentials = await this.readCredentials();
    if (!credentials.clientId || !credentials.clientSecret) {
      throw new NotFoundError(AdminErrorCode.ADMIN_GOOGLE_NOT_CONFIGURED, {
        message: 'Google sign-in is not configured.',
      });
    }
    return credentials;
  }
}

/**
 * id_token 에서 신원을 읽는다. **서명을 검증하지 않는다.**
 *
 * 이 토큰은 브라우저를 거치지 않고 구글의 토큰 엔드포인트에서 TLS 로 직접 받아온 것이라,
 * 중간에 바꿔치기할 자리가 없다(OIDC Core 3.1.3.7 도 이 경우 검증을 생략할 수 있다고 한다).
 * 브라우저가 들고 온 id_token 을 받는 흐름이라면 이야기가 다르지만, 우리는 그런 경로가 없다.
 */
function decodeIdToken(idToken: string): AdminGoogleProfile {
  const payload = idToken.split('.')[1];
  if (!payload) {
    throw new AdminGoogleSignInFailedError();
  }

  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
  } catch {
    throw new AdminGoogleSignInFailedError();
  }

  const providerId = typeof claims.sub === 'string' ? claims.sub : '';
  if (!providerId) {
    throw new AdminGoogleSignInFailedError();
  }

  return {
    providerId,
    email: typeof claims.email === 'string' ? claims.email : null,
    /*
      **문자열 'true' 도 받는다.** 이 클레임은 구글이 boolean 으로 주지만, 명세(OIDC Core 5.1)가
      문자열 표기도 허용해 두어 언젠가 그렇게 올 수 있다. 반대로 "값이 있으니 검증됐다" 로는
      절대 보지 않는다 — 검증 안 된 이메일로 남의 관리자 계정에 들어오는 길이 된다.
    */
    emailVerified: claims.email_verified === true || claims.email_verified === 'true',
    name: typeof claims.name === 'string' ? claims.name : null,
  };
}
