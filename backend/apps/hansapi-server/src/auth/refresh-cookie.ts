import type { Request, Response } from 'express';
import type { RequestMeta } from '@hansapi/auth-application';

/**
 * refresh token 은 httpOnly 쿠키로만 오간다(자바스크립트 접근 차단, XSS 시 탈취 방지).
 * access token 은 응답 바디로 내려가 프론트 메모리에 보관한다.
 */
export const REFRESH_COOKIE = 'refresh_token';

// 크로스 오리진 SPA 를 고려한 쿠키 옵션. 운영(HTTPS)에서는 secure+sameSite=none 이 필요하다.
// AUTH_COOKIE_SECURE=true 면 secure/none 로 올린다(기본은 개발 편의를 위해 lax/비secure).
const secure = process.env.AUTH_COOKIE_SECURE === 'true';

export function setRefreshCookie(
  res: Response,
  token: string,
  expiresAt: Date,
): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: secure ? 'none' : 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { path: '/' });
}

export function readRefreshCookie(req: Request): string | undefined {
  // cookie-parser 가 Request.cookies 를 any 로 augment 하므로, 명시 타입으로 좁힌다.
  const cookies: Record<string, string> | undefined = (
    req as unknown as { cookies?: Record<string, string> }
  ).cookies;
  return cookies?.[REFRESH_COOKIE];
}

/** 로그·세션 기록용 요청 부가정보(IP·UA)를 뽑는다. */
export function requestMeta(req: Request): RequestMeta {
  return {
    ip: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  };
}
