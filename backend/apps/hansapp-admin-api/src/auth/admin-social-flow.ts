import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import type { ConfigSource } from '@hansapp/common';

/**
 * 흐름 소유권 쿠키의 이름 접두사. 뒤에 flowId 가 붙어 **흐름마다 이름이 갈린다** —
 * 이름이 하나면 탭 두 개로 동시에 시작했을 때 나중 것이 앞 것을 덮어써 앞 탭이 실패한다.
 */
const FLOW_COOKIE_PREFIX = 'hansapp.admin_oauth_';

/** 쿠키를 소셜 경로 밖으로 내보내지 않는다. 다른 요청에 실려 다닐 이유가 없다. */
const FLOW_COOKIE_PATH = '/auth/social';

/** 쿠키 수명. state 의 수명(10분)과 같아야 한다 — 한쪽만 먼저 죽으면 대조 자체가 불가능하다. */
const FLOW_COOKIE_TTL_MS = 600_000;

// 부팅 때 한 번 굳히는 설정. 요청마다 다시 읽지 않는다(admin-cookie.ts 와 같은 방식).
let secure = false;
let consoleBaseUrl = '';

/**
 * 부팅 시점에 설정을 읽어 고정한다(main 부트스트랩에서 호출).
 *
 * **콘솔 주소는 API 주소와 다를 수 있다.** 배포에서는 SPA 를 같은 오리진으로 내보내 같지만,
 * 로컬은 콘솔이 Vite dev server(5275)로 따로 뜨고 API 는 3001 이다. 그래서 구글에서 돌아온
 * 뒤 사람을 돌려보낼 곳은 `apps-admin-api.externalUrl` 이 정한다(메일 링크와 같은 값이다).
 */
export function initAdminSocial(cfg: ConfigSource): void {
  secure = cfg.getBoolOrDefault('auth.cookieSecure');
  consoleBaseUrl = (cfg.getStringOrDefault('apps-admin-api.externalUrl') || '').replace(/\/+$/, '');
}

/**
 * 요청이 실제로 들어온 오리진: `{scheme}://{host}`. 리버스 프록시 뒤에서는 전달 헤더를 본다.
 *
 * **redirect_uri 를 이 값으로 만든다.** 별도 설정을 두면 그 값과 실제 접속 주소가 어긋나는 날
 * 구글이 redirect_uri_mismatch 로 막는다 — 시작도 콜백도 같은 호스트로 오므로 이러면 항상 맞는다.
 */
export function externalBaseUrl(req: Request): string {
  const forwardedProto = first(req.headers['x-forwarded-proto']);
  const forwardedHost = first(req.headers['x-forwarded-host']);
  const proto = forwardedProto ?? req.protocol ?? 'https';
  const host = forwardedHost ?? req.get('host') ?? '';
  return `${proto}://${host}`;
}

/** 구글에 등록해 둔 승인된 리디렉션 URI. 시작과 콜백 두 번 다 같은 값이 나와야 한다. */
export function googleCallbackUrl(req: Request): string {
  return `${externalBaseUrl(req)}/auth/social/google/callback`;
}

/**
 * 콘솔 화면으로 돌아가는 주소.
 *
 * @param path `/` 로 시작하는 콘솔 안의 경로. **바깥으로는 절대 나가지 않는다** —
 *   `//evil.com` 처럼 스킴 없는 절대 URL 도 여기서 걸러진다(오픈 리다이렉트 방지).
 */
export function consoleUrl(path: string, query?: Record<string, string>): string {
  const safe = path.startsWith('/') && !path.startsWith('//') ? path : '/';
  const search = query ? `?${new URLSearchParams(query).toString()}` : '';
  return `${consoleBaseUrl}${safe}${search}`;
}

/**
 * 흐름을 이 브라우저에 묶는다. nonce 를 쿠키로 심고 state 에 실을 짝을 돌려준다.
 *
 * **이것이 로그인 CSRF 방어의 핵심이다.** state 서명만으로는 "우리가 발급했다" 밖에 증명하지
 * 못한다 — 공격자도 정상적으로 시작하면 유효한 state 를 받아간다. 쿠키는 브라우저 밖으로
 * 나가지 않으므로, 공격자가 자기 콜백 URL 을 피해자에게 보내도 대조에서 걸린다.
 *
 * SameSite 는 **lax 여야 한다** — 구글에서 돌아오는 것은 크로스사이트 top-level 이동이라
 * strict 면 쿠키가 실려 오지 않는다(로그인 쿠키는 그럴 필요가 없어 strict 그대로다).
 */
export function issueFlowNonce(res: Response): { flowId: string; nonce: string } {
  const flowId = randomBytes(8).toString('hex');
  const nonce = randomBytes(32).toString('base64url');
  res.cookie(`${FLOW_COOKIE_PREFIX}${flowId}`, nonce, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: FLOW_COOKIE_PATH,
    maxAge: FLOW_COOKIE_TTL_MS,
  });
  return { flowId, nonce };
}

/**
 * 콜백이 이 흐름을 시작한 브라우저에서 왔는지 본다. **확인 뒤에는 쿠키를 지운다** —
 * 일회용이라 남겨 둘 이유가 없고, 재사용도 막는다.
 */
export function verifyFlowNonce(
  req: Request,
  res: Response,
  flow: { flowId: string; nonce: string },
): boolean {
  const name = `${FLOW_COOKIE_PREFIX}${flow.flowId}`;
  // cookie-parser 가 Request.cookies 를 any 로 augment 하므로, 명시 타입으로 좁힌다
  // (admin-cookie.ts 의 readRefreshCookie 와 같은 방식이다).
  const cookies: Record<string, string> | undefined = (
    req as unknown as { cookies?: Record<string, string> }
  ).cookies;
  const seen = cookies?.[name];
  res.clearCookie(name, { path: FLOW_COOKIE_PATH });

  const a = Buffer.from(seen ?? '');
  const b = Buffer.from(flow.nonce);
  // 길이가 같을 때만 timingSafeEqual 을 쓸 수 있다. 다르면 그 자체로 불일치다.
  return a.length === b.length && timingSafeEqual(a, b);
}

/** 헤더 값(문자열 | 배열 | 콤마목록)에서 첫 값을 뽑는다. */
function first(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined;
  const raw = Array.isArray(value) ? value[0] : value;
  return raw.split(',')[0]?.trim() || undefined;
}
