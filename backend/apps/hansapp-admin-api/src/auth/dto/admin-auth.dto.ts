import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AdminRole } from '@hansapp/admin-application/auth';
import type { AdminPasswordResetTarget } from '@hansapp/admin-application/auth';
import { SUPPORTED_LANGS } from '@hansapp/common';

export class AdminLoginRequestDto {
  @ApiProperty({ description: '관리자 이메일', example: 'admin@example.com' })
  @IsEmail()
  readonly email!: string;

  @ApiProperty({ description: '비밀번호', example: 'p@ssw0rd!' })
  @IsString()
  // bcrypt 는 72바이트 뒤를 버리므로 그 너머는 받아도 의미가 없다.
  @MaxLength(72)
  readonly password!: string;
}

/**
 * 토큰 응답.
 *
 * **refresh token 이 없다.** httpOnly 쿠키로만 오간다 — 관리자 클라이언트는 같은 오리진의
 * SPA 하나뿐이라 JS 가 refresh 를 손에 쥘 이유가 없다.
 */
export class AdminTokenResponseDto {
  @ApiProperty({ description: 'access token(JWT)' })
  readonly accessToken!: string;

  @ApiProperty({ description: '토큰 타입', example: 'Bearer' })
  readonly tokenType!: 'Bearer';

  @ApiProperty({ description: 'access token 만료(초)', example: 300 })
  readonly expiresIn!: number;

  @ApiProperty({
    description:
      '비밀번호를 바꿔야 하는 상태인지. true 면 비밀번호를 바꾸기 전까지 다른 API 가 403 이다.',
  })
  readonly mustChangePassword!: boolean;
}

/**
 * 비밀번호 찾기 요청(로그인 화면).
 *
 * **응답은 계정이 있든 없든 같다.** 여기에 실린 주소가 관리자인지 아닌지를 알려 주면
 * 표적을 좁혀 주는 셈이라, 성공·실패를 가르지 않는다.
 */
export class AdminForgotPasswordRequestDto {
  @ApiProperty({ description: '관리자 이메일', example: 'admin@example.com' })
  @IsEmail()
  @MaxLength(320)
  readonly email!: string;
}

/**
 * 이 링크가 누구의 것인지. **재설정 화면이 열릴 때 받는 값이다.**
 *
 * 이메일을 토큰 안에 담아 브라우저가 풀어 보게 하지 않는 이유는 **화면이 그 값을 검증할 수
 * 없어서다** — 아무나 남의 주소를 넣어 링크를 만들면 우리 도메인에서 그 주소가 그대로 보인다.
 */
export class AdminPasswordResetTargetDto {
  @ApiProperty({
    description:
      '가린 이메일. **원문은 내보내지 않는다** — 링크를 쥔 사람은 이미 그 메일함 주인이라 ' +
      '새로 알 것이 없고, 화면 공유·스크린샷으로 새는 자리만 줄인다.',
    example: 'plz***@gmail.com',
  })
  readonly maskedEmail!: string;

  @ApiProperty({ description: '링크 만료 시각(ISO 8601)' })
  readonly expiresAt!: string;

  constructor(target: AdminPasswordResetTarget) {
    this.maskedEmail = target.maskedEmail;
    this.expiresAt = target.expiresAt.toISOString();
  }
}

/** 메일로 받은 링크의 토큰으로 비밀번호를 다시 세운다. */
export class AdminResetPasswordRequestDto {
  @ApiProperty({ description: '메일 링크에 실려 온 토큰' })
  @IsString()
  @MaxLength(200)
  readonly token!: string;

  @ApiProperty({ description: '새 비밀번호', minLength: 10 })
  @IsString()
  // 본인이 바꾸는 다른 경로와 같은 기준이다.
  @MinLength(10)
  @MaxLength(72)
  readonly newPassword!: string;
}

export class AdminChangePasswordRequestDto {
  @ApiProperty({ description: '현재 비밀번호' })
  @IsString()
  @MaxLength(72)
  readonly currentPassword!: string;

  @ApiProperty({ description: '새 비밀번호', minLength: 10 })
  @IsString()
  /*
    관리자 계정은 표적이 좁고 하나 뚫리면 전부라, 공개 회원(8자)보다 길게 요구한다.
    상한 72 는 bcrypt 가 그 뒤를 버리기 때문이다 — 더 받아도 검증되지 않는 구간이 생긴다.
  */
  @MinLength(10)
  @MaxLength(72)
  readonly newPassword!: string;
}

export class AdminMeResponseDto {
  @ApiProperty({ description: '관리자 번호' })
  readonly id!: number;

  @ApiProperty({ description: '이메일' })
  readonly email!: string;

  @ApiPropertyOptional({ description: '표시 이름' })
  readonly name?: string | null;

  @ApiPropertyOptional({ description: '마지막 로그인 시각(ISO 8601)' })
  readonly lastLoginAt?: string | null;

  @ApiProperty({ description: '비밀번호를 바꿔야 하는 상태인지' })
  readonly mustChangePassword!: boolean;

  @ApiProperty({
    description:
      '내 등급. **화면이 이 값으로 관리자 화면의 버튼을 가린다** — 자기보다 높은 등급의 ' +
      '계정은 만들지도 고치지도 못한다(막는 것은 서버다).',
    enum: AdminRole,
  })
  readonly role!: AdminRole;

  @ApiProperty({
    description: '관리 화면·메일 언어',
    enum: SUPPORTED_LANGS,
    example: 'ko',
  })
  readonly language!: string;

  @ApiProperty({
    description: '화면의 시각 표기에 쓰는 IANA 타임존 ID',
    example: 'Asia/Seoul',
  })
  readonly timeZone!: string;
}

/**
 * 관리자 본인 설정 변경 요청. **보낸 항목만 바뀐다.**
 *
 * 이름·비밀번호는 여기 없다 — 비밀번호는 별도 경로(`POST /auth/password`)이고,
 * 표시 이름은 계정을 만든 운영자가 정한다.
 */
export class AdminUpdateLocaleRequestDto {
  @ApiPropertyOptional({
    description: '관리 화면·메일 언어',
    enum: SUPPORTED_LANGS,
    example: 'ko',
  })
  @IsOptional()
  @IsIn(SUPPORTED_LANGS)
  readonly language?: string;

  @ApiPropertyOptional({
    description: 'IANA 타임존 ID',
    example: 'Asia/Seoul',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  readonly timeZone?: string;
}
