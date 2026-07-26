import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  Auth,
  AuthService,
  AuthType,
  CurrentUser,
  FirstPartyOnly,
  Public,
} from '@hansapi/auth-application';
import type { AuthResult, AuthUser } from '@hansapi/auth-application';
import type { SupportedLang } from '@hansapi/common';

import { Lang } from '../common/lang.decorator';

import {
  ChangePasswordRequestDto,
  LoginRequestDto,
  MeResponseDto,
  PasswordResetConfirmDto,
  PasswordResetRequestDto,
  SignupCodeRequestDto,
  SignupRequestDto,
  TokenResponseDto,
} from './dto/auth.dto';
import {
  clearRefreshCookie,
  requestMeta,
  respondTokens,
} from './refresh-cookie';

/**
 * 인증(로그인 흐름) 엔드포인트. 프론트가 직접 호출하는 이메일 가입·로그인·계정관리가 여기 있다.
 * OAuth2 토큰 프로토콜(교환·갱신)은 /oauth 로 분리돼 있다.
 *
 * refresh token 은 httpOnly 쿠키로만 내려가고, 바디에는 access token 만 담는다.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup/request-code')
  @Public()
  @FirstPartyOnly()
  @HttpCode(202)
  @ApiOperation({
    summary: '가입 인증 코드 발송',
    description:
      '가입할 이메일로 인증 코드를 보낸다(계정 생성 전). 이미 가입된 이메일이면 409. 같은 이메일로 1시간 5통·재발송 쿨다운을 초과하면 429.',
  })
  async requestSignupCode(
    @Body() dto: SignupCodeRequestDto,
    @Lang() lang: SupportedLang,
  ): Promise<void> {
    await this.authService.requestSignupCode(dto.email, lang);
  }

  @Post('signup')
  @Public()
  @FirstPartyOnly()
  @ApiOperation({
    summary: '이메일 회원가입',
    description:
      '사전에 발송된 인증 코드를 검증하고 계정을 만든다(검증된 이메일만 계정을 소유). 코드가 틀리거나 만료면 400, 이미 가입된 이메일이거나 탈퇴 후 재가입 제한기간이면 409. 성공 시 곧바로 로그인 토큰을 발급한다.',
  })
  @ApiCreatedResponse({ type: TokenResponseDto })
  async signup(
    @Body() dto: SignupRequestDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TokenResponseDto> {
    const result = await this.authService.signup(dto, requestMeta(req));
    return this.respondWithTokens(res, result);
  }

  @Post('login')
  @Public()
  @FirstPartyOnly()
  @HttpCode(200)
  @ApiOperation({
    summary: '이메일 로그인',
    description:
      '이메일/비밀번호로 로그인한다. 소셜 전용 계정(비밀번호 없음)은 이메일 로그인이 불가하다.',
  })
  @ApiOkResponse({ type: TokenResponseDto })
  async login(
    @Body() dto: LoginRequestDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TokenResponseDto> {
    const result = await this.authService.login(dto, requestMeta(req));
    return this.respondWithTokens(res, result);
  }

  @Get('me')
  @Auth(AuthType.Jwt)
  @ApiOperation({
    summary: '내 정보',
    description: '현재 로그인 사용자 정보를 반환한다.',
  })
  @ApiOkResponse({ type: MeResponseDto })
  async me(@CurrentUser() user: AuthUser): Promise<MeResponseDto> {
    const u = await this.authService.getProfile(user.userId);
    return {
      id: u.id,
      email: u.email,
      emailVerified: u.emailVerified,
      name: u.name,
      role: u.role,
      joinType: u.joinType,
    };
  }

  @Post('withdraw')
  @Auth(AuthType.Jwt)
  @HttpCode(204)
  @ApiOperation({
    summary: '회원 탈퇴',
    description:
      '계정을 탈퇴 상태로 전환한다. 모든 세션이 폐기되고 재로그인이 차단되며, 30일간 같은 이메일 재가입이 제한된다.',
  })
  async withdraw(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.authService.withdraw(user.userId, requestMeta(req));
    clearRefreshCookie(res);
  }

  @Post('password/change')
  @Auth(AuthType.Jwt)
  @HttpCode(204)
  @ApiOperation({
    summary: '비밀번호 변경',
    description: '로그인 상태에서 비밀번호를 변경한다.',
  })
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordRequestDto,
    @Req() req: Request,
  ): Promise<void> {
    await this.authService.changePassword(user.userId, dto, requestMeta(req));
  }

  @Post('password/reset-request')
  @Public()
  @FirstPartyOnly()
  @HttpCode(202)
  @ApiOperation({
    summary: '비밀번호 재설정 요청',
    description:
      '가입 이메일로 인증 코드를 보낸다. 계정 유무·대상 여부와 무관하게 202(존재 노출 방지). 발송 상한 초과 시 429.',
  })
  async requestPasswordReset(
    @Body() dto: PasswordResetRequestDto,
    @Lang() lang: SupportedLang,
  ): Promise<void> {
    await this.authService.requestPasswordReset(dto.email, lang);
  }

  @Post('password/reset')
  @Public()
  @FirstPartyOnly()
  @HttpCode(204)
  @ApiOperation({
    summary: '비밀번호 재설정 확정',
    description:
      '메일로 받은 인증 코드로 새 비밀번호를 설정한다. 코드가 틀리거나 만료면 400. 성공 시 전체 세션이 폐기된다.',
  })
  async resetPassword(
    @Body() dto: PasswordResetConfirmDto,
    @Req() req: Request,
  ): Promise<void> {
    await this.authService.resetPassword(dto, requestMeta(req));
  }

  /** refresh 를 쿠키+바디로, access 는 바디로 반환한다. */
  private respondWithTokens(
    res: Response,
    result: AuthResult,
  ): TokenResponseDto {
    return respondTokens(res, result.tokens);
  }
}
