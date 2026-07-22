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
import type { Request, Response } from 'express';
import {
  Auth,
  AuthType,
  CurrentUser,
  OAuthTokenService,
  Public,
} from '@hansapi/auth-application';
import type { AuthTokens, AuthUser } from '@hansapi/auth-application';

import { TokenRequestDto, TokenResponseDto } from '../auth/dto/auth.dto';
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

  @Post('token')
  @Public()
  @HttpCode(200)
  @ApiOperation({
    summary: '토큰 발급/갱신',
    description:
      'grant_type=authorization_code 는 소셜 릴레이 인가코드(code)를 토큰으로 교환한다. ' +
      'grant_type=refresh_token 은 refresh token(바디 또는 httpOnly 쿠키)을 rotate 하고 새 토큰을 발급한다.',
  })
  @ApiOkResponse({ type: TokenResponseDto })
  async token(
    @Body() dto: TokenRequestDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TokenResponseDto> {
    let tokens: AuthTokens;
    if (dto.grant_type === 'authorization_code') {
      if (!dto.code) {
        throw new BadRequestException('code 가 필요합니다.');
      }
      tokens = await this.grants.exchangeAuthorizationCode(
        dto.code,
        requestMeta(req),
      );
    } else {
      const refreshToken = dto.refresh_token ?? readRefreshCookie(req);
      if (!refreshToken) {
        throw new BadRequestException('refresh_token 이 필요합니다.');
      }
      tokens = await this.grants.refresh(refreshToken);
    }

    return respondTokens(res, tokens);
  }

  @Delete('logout')
  @Auth(AuthType.Jwt)
  @HttpCode(204)
  @ApiOperation({
    summary: '로그아웃',
    description: '현재 세션(refresh)을 폐기하고 쿠키를 지운다.',
  })
  async logout(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.grants.logout(user.sessionId, user.userId, requestMeta(req));
    clearRefreshCookie(res);
  }
}
