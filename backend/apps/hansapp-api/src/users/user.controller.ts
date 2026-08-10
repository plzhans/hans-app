import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiExcludeEndpoint,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  Auth,
  AuthService,
  AuthType,
  ConsentService,
  CurrentUser,
  SocialService,
  toOAuthProvider,
} from '@hansapp/auth-application';
import type { AuthUser } from '@hansapp/auth-application';
import type { SupportedLang } from '@hansapp/common';

import { Lang } from '../common/lang.decorator';
import { clearRefreshCookie, requestMeta } from '../auth/refresh-cookie';

import {
  ConsentRecordDto,
  LinkTokenResponseDto,
  MeResponseDto,
  SessionDto,
  UpdatePasswordRequestDto,
  UpdateProfileRequestDto,
} from './dto/user.dto';

/**
 * 내 계정. **`/auth` 와 나눠 두는 이유가 있다.**
 *
 * `/auth` 는 자격증명으로 **세션을 얻는 과정**이다 — 가입, 로그인, 소셜 왕복, 비밀번호 재설정
 * (아직 누구인지 모르는 상태의 복구). 여기는 그 과정이 끝난 뒤의 자원이다: 이미 검증된 사람이
 * 자기 프로필·기기·동의·비밀번호·소셜 연동을 읽고 고친다. **전부 로그인이 필요하다.**
 *
 * 섞어 두면 두 가지가 흐려진다. 하나는 "이 경로가 로그인을 요구하나" 이고, 다른 하나는
 * 소셜 시작 경로(`GET /auth/{provider}`)가 `/auth` 아래 아무 조각이나 삼키는 와일드카드라는
 * 점이다 — 유저 경로가 같은 접두사에 있으면 등록 순서에 기대게 된다.
 *
 * [스펙에 싣는 것은 조회 하나뿐이다]
 * **스펙에 있는 것 = 외부가 부를 수 있는 것.** 연동한 앱이 access token 으로 부를 만한 것은
 * `GET /users/me` 뿐이고, 나머지(이름·비밀번호·기기·동의·소셜연동·탈퇴)는 계정 관리라
 * 우리 인증웹 화면에서 한다. 그래서 **기본값이 @ApiExcludeEndpoint** 다 —
 * 새 엔드포인트를 여기 추가하면 일단 빠지고, 대외에 열 것만 골라서 뺀다.
 */
@ApiTags('users')
@Controller('users')
export class UserController {
  constructor(
    private readonly authService: AuthService,
    private readonly socialService: SocialService,
    private readonly consentService: ConsentService,
  ) {}

  @Get('me')
  @Auth(AuthType.Jwt)
  @ApiOperation({
    summary: '내 정보',
    description: '현재 로그인 사용자 정보를 반환한다.',
  })
  @ApiOkResponse({ type: MeResponseDto })
  async me(@CurrentUser() user: AuthUser): Promise<MeResponseDto> {
    const [u, linked] = await Promise.all([
      this.authService.getProfile(user.userId),
      this.socialService.listLinked(user.userId),
    ]);
    return {
      id: u.id,
      email: u.email,
      emailVerified: u.emailVerified,
      name: u.name,
      role: u.role,
      joinType: u.joinType,
      language: u.language,
      timeZone: u.timeZone,
      hasPassword: !!u.password,
      createdAt: u.createdAt.toISOString(),
      linkedProviders: linked,
    };
  }

  @Patch('me')
  @Auth(AuthType.Jwt)
  @ApiExcludeEndpoint()
  @HttpCode(204)
  @ApiOperation({
    summary: '내 정보 수정',
    description:
      '표시 이름·언어·타임존을 바꾼다. 보낸 항목만 바뀐다. ' +
      '개인정보처리방침 제10조의 정정 요구에 응하는 자리다.',
  })
  async updateMe(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateProfileRequestDto,
  ): Promise<void> {
    if (dto.name !== undefined) {
      await this.authService.updateName(user.userId, dto.name);
    }
    if (dto.language !== undefined || dto.timeZone !== undefined) {
      await this.authService.updateLocale(user.userId, {
        language: dto.language,
        timeZone: dto.timeZone,
      });
    }
  }

  @Delete('me')
  @Auth(AuthType.Jwt)
  @ApiExcludeEndpoint()
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

  @Put('me/password')
  @Auth(AuthType.Jwt)
  @ApiExcludeEndpoint()
  @HttpCode(204)
  @ApiOperation({
    summary: '비밀번호 변경·설정',
    description:
      '비밀번호를 바꾸거나, 소셜로만 가입해 없던 계정에 새로 설정한다.\n\n' +
      '**어느 쪽인지는 서버가 정한다** — 계정에 비밀번호가 있으면 `currentPassword` 가 ' +
      '반드시 있어야 하고 틀리면 **401**, 없으면 새 비밀번호만 받는다. ' +
      '설정하면 이메일 로그인이 가능해지고 소셜 연동을 모두 해제할 수 있게 된다.',
  })
  async updatePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdatePasswordRequestDto,
    @Req() req: Request,
    @Lang() lang: SupportedLang,
  ): Promise<void> {
    await this.authService.updatePassword(
      user.userId,
      dto,
      requestMeta(req),
      lang,
    );
  }

  @Get('me/sessions')
  @Auth(AuthType.Jwt)
  @ApiExcludeEndpoint()
  @ApiOperation({
    summary: '로그인한 기기 목록',
    description:
      '살아 있는 세션을 최근 활동 순으로 돌려준다. 계정 이용약관 제6조④가 약속한 기능이다.',
  })
  @ApiOkResponse({ type: [SessionDto] })
  async sessions(@CurrentUser() user: AuthUser): Promise<SessionDto[]> {
    const rows = await this.authService.listSessions(user.userId);
    return rows.map((r) => ({
      sessionId: r.sessionId,
      userAgent: r.userAgent,
      ip: r.ip,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      // access token 에 sid 가 실려 있어 지금 이 기기를 가릴 수 있다.
      current: r.sessionId === user.sessionId,
    }));
  }

  @Delete('me/sessions/:sessionId')
  @Auth(AuthType.Jwt)
  @ApiExcludeEndpoint()
  @HttpCode(204)
  @ApiOperation({
    summary: '기기 로그아웃',
    description:
      '세션 하나를 폐기한다. 자기 세션만 지워진다(남의 식별자를 넣으면 404 성격의 오류).',
  })
  async revokeSession(
    @CurrentUser() user: AuthUser,
    @Param('sessionId') sessionId: string,
  ): Promise<void> {
    await this.authService.revokeSession(user.userId, sessionId);
  }

  @Delete('me/sessions')
  @Auth(AuthType.Jwt)
  @ApiExcludeEndpoint()
  @HttpCode(204)
  @ApiOperation({
    summary: '모든 기기에서 로그아웃',
    description:
      '이 계정의 세션을 전부 폐기한다. 지금 이 기기도 포함되므로 호출한 쪽도 로그아웃된다.',
  })
  async revokeAllSessions(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.authService.revokeAllSessions(user.userId, requestMeta(req));
    // **쿠키도 같이 지운다.** 세션 행만 지우면 브라우저에는 죽은 refresh 쿠키가 남고,
    // 프론트는 힌트 쿠키를 보고 로그인 상태로 착각해 refresh 를 부르다 401 을 맞는다.
    clearRefreshCookie(res);
  }

  @Get('me/consents')
  @Auth(AuthType.Jwt)
  @ApiExcludeEndpoint()
  @ApiOperation({
    summary: '내 동의 기록',
    description:
      '가입 시 무엇에 언제 어느 판으로 동의했는지 돌려준다. 개인정보처리방침 제10조의 열람 요구에 응하는 자리다.',
  })
  @ApiOkResponse({ type: [ConsentRecordDto] })
  async consents(@CurrentUser() user: AuthUser): Promise<ConsentRecordDto[]> {
    const rows = await this.consentService.listByUser(user.userId);
    return rows.map((r) => ({
      type: r.type,
      version: r.version,
      agreedAt: r.agreedAt.toISOString(),
    }));
  }

  @Post('me/socials/link-token')
  @Auth(AuthType.Jwt)
  @ApiExcludeEndpoint()
  @ApiOperation({
    summary: '소셜 연동 시작 토큰 발급',
    description:
      '로그인 상태에서 연동 시작 토큰을 받는다. 이후 `GET /auth/{provider}?link_token=<토큰>` ' +
      '으로 이동하면 현재 계정에 연동된다.',
  })
  @ApiOkResponse({ type: LinkTokenResponseDto })
  prepareLink(@CurrentUser() user: AuthUser): LinkTokenResponseDto {
    return { linkToken: this.socialService.prepareLink(user.userId) };
  }

  @Delete('me/socials/:provider')
  @Auth(AuthType.Jwt)
  @ApiExcludeEndpoint()
  @HttpCode(204)
  @ApiOperation({
    summary: '소셜 연동 해제',
    description:
      '현재 계정에서 해당 provider 연동을 제거한다. 마지막 로그인 수단(비밀번호도 없고 연동 하나뿐)이면 거부한다.',
  })
  async unlink(
    @CurrentUser() user: AuthUser,
    @Param('provider') providerParam: string,
    @Req() req: Request,
    @Lang() lang: SupportedLang,
  ): Promise<void> {
    const provider = toOAuthProvider(providerParam);
    if (!provider) {
      throw new BadRequestException('Unsupported social provider.');
    }
    await this.socialService.unlink(
      user.userId,
      provider,
      requestMeta(req),
      lang,
    );
  }
}
