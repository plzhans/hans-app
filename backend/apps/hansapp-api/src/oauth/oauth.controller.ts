import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Auth, AuthType, CurrentUser, OAuthTokenService, Public } from '@hansapp/auth-application';
import type { AuthTokens, AuthUser } from '@hansapp/auth-application';

import {
  AuthorizeRequestDto,
  AuthorizeResponseDto,
  TokenRequestDto,
  TokenResponseDto,
} from '../auth/dto/auth.dto';
import {
  clearRefreshCookie,
  readRefreshCookie,
  requestMeta,
  respondTokens,
} from '../auth/refresh-cookie';

/**
 * OAuth2 토큰 프로토콜(인가) 엔드포인트. 로그인 흐름(/auth)과 분리돼 있다.
 * - POST /oauth/token: 인가코드 교환·refresh 갱신
 * - DELETE /oauth/logout: 현재 세션 폐기
 *
 * refresh token 은 httpOnly 쿠키로만 오간다. access token 만 바디로 반환한다.
 */
@ApiTags('oauth')
@Controller('oauth')
export class OAuthController {
  constructor(private readonly grants: OAuthTokenService) {}

  /**
   * **@FirstPartyOnly() 를 붙이지 않는다.** 외부 앱(등록된 클라이언트)도 여기서 토큰을 받아야 하기 때문이다.
   * 대신 오리진 검사를 경로별로 나눈다 — 라우트 하나에 자격증명 출처가 셋이라 규칙이 다르다.
   *
   *   authorization_code : 코드에 박힌 clientId 기준으로 검사(서버가 발급 때 정한 값이라 위조 불가)
   *   refresh_token(쿠키) : 1st-party 만. 브라우저가 자동으로 실어 보내므로 CSRF 방어가 필요하다
   *   refresh_token(바디) : 검사 없음. 값을 아는 것 자체가 자격이고 브라우저가 대신 붙여주지 않는다
   */
  @Post('token')
  @Public()
  // 인가코드 교환·refresh 는 정상 흐름이면 IP 당 저빈도다. 위조 code/verifier 무차별 시도와
  // 정크 요청이 DB·검증 연산에 닿기 전에 IP 당 60초 20회로 조인다(전역 300 보다 타이트).
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @HttpCode(200)
  @ApiOperation({
    summary: '토큰 발급/갱신',
    description:
      'grant_type=authorization_code 는 인가코드(code)를 토큰으로 교환한다. 코드에 기록된 ' +
      '클라이언트의 등록 오리진과 요청 Origin 이 일치해야 한다.\n\n' +
      'grant_type=refresh_token 은 refresh token(바디 또는 httpOnly 쿠키)을 갱신한다. ' +
      '**refresh token 은 1회용이다** — 갱신에 성공하면 새 refresh token 이 나오고 ' +
      '**직전 것은 그 즉시 무효**가 된다(rotate). 응답으로 받은 새 값으로 반드시 교체해 두고, ' +
      '이전 값을 다시 보내면 거부된다. 같은 토큰으로 두 번 갱신하거나, 갱신 응답을 저장하지 못한 채 ' +
      '재시도하면 세션이 끊어진다.',
  })
  @ApiOkResponse({ type: TokenResponseDto })
  async token(
    @Body() dto: TokenRequestDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TokenResponseDto> {
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;

    let tokens: AuthTokens;
    if (dto.grant_type === 'authorization_code') {
      if (!dto.code) {
        throw new BadRequestException('code is required.');
      }
      tokens = await this.grants.exchangeAuthorizationCode(
        dto.code,
        requestMeta(req),
        origin,
        dto.code_verifier,
      );
    } else {
      const fromBody = dto.refresh_token;
      const refreshToken = fromBody ?? readRefreshCookie(req);
      if (!refreshToken) {
        throw new BadRequestException('refresh_token is required.');
      }
      if (!fromBody) {
        this.grants.assertFirstPartyOrigin(origin);
      }
      tokens = await this.grants.refresh(refreshToken);
    }

    return respondTokens(res, tokens);
  }

  @Post('authorize')
  @Auth(AuthType.Jwt)
  @HttpCode(200)
  @ApiOperation({
    summary: '인가 코드 발급',
    description:
      'OAuth 2.0 Authorization Code Grant 의 인가 코드(authorization code)를 발급한다. ' +
      '로그인된 사용자에 대해, 클라이언트가 등록한 `redirect_uri` 로 전달할 1회용 코드다.\n\n' +
      '발급된 코드는 `POST /oauth/token` 에서 access token 으로 교환한다.',
  })
  @ApiOkResponse({ type: AuthorizeResponseDto })
  async authorize(
    @CurrentUser() user: AuthUser,
    @Body() dto: AuthorizeRequestDto,
  ): Promise<AuthorizeResponseDto> {
    const code = await this.grants.issueAuthorizationCode(
      user.userId,
      dto.redirectUri,
      dto.clientId,
      dto.codeChallenge,
      // 옮겨 가는 앱이 **지금 세션과 같은 수명**을 갖게 한다. 로그인할 때 한 선택이다.
      user.sessionId,
    );
    return { code };
  }

  /**
   * **아무 자격증명도 요구하지 않는다.** 로그아웃은 "잊는" 동작이라 인증을 걸면 안 된다 —
   * access token 이 만료됐을 때 가드가 401 로 끊으면 이 응답에 쿠키 삭제도 안 실려
   * 세션이 살아남는다. 실제로 그래서 로그아웃이 안 되는 일이 있었다.
   *
   * 폐기 대상은 refresh 쿠키가 정한다(secret 까지 대조하므로 남의 세션은 못 지운다).
   * 쿠키가 없거나 이미 죽은 세션이어도 **쿠키 삭제는 항상 나간다.**
   */
  @Delete('logout')
  @Public()
  @HttpCode(204)
  @ApiOperation({
    summary: '로그아웃',
    description:
      '현재 세션(refresh 쿠키)을 폐기하고 인증 쿠키를 지운다. ' +
      '자격증명이 없거나 만료됐어도 쿠키는 지운다.',
  })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.grants.logoutByRefreshToken(readRefreshCookie(req), requestMeta(req));
    clearRefreshCookie(res);
  }
}
