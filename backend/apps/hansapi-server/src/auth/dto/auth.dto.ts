import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/** 이메일 가입 요청 */
export class SignupRequestDto {
  @ApiProperty({ description: '이메일', example: 'user@example.com' })
  @IsEmail()
  @MaxLength(320)
  readonly email!: string;

  @ApiProperty({ description: '비밀번호(8자 이상)', example: 'p@ssw0rd!' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  readonly password!: string;

  @ApiPropertyOptional({ description: '표시 이름', example: '홍길동' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  readonly name?: string;
}

/** 이메일 로그인 요청 */
export class LoginRequestDto {
  @ApiProperty({ description: '이메일', example: 'user@example.com' })
  @IsEmail()
  readonly email!: string;

  @ApiProperty({ description: '비밀번호', example: 'p@ssw0rd!' })
  @IsString()
  readonly password!: string;
}

/** 비밀번호 변경 요청(로그인 상태) */
export class ChangePasswordRequestDto {
  @ApiProperty({ description: '현재 비밀번호' })
  @IsString()
  readonly currentPassword!: string;

  @ApiProperty({ description: '새 비밀번호(8자 이상)' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  readonly newPassword!: string;
}

/** 비밀번호 재설정 요청(이메일로 링크 발송) */
export class PasswordResetRequestDto {
  @ApiProperty({ description: '가입 이메일' })
  @IsEmail()
  readonly email!: string;
}

/** 비밀번호 재설정 확정 */
export class PasswordResetConfirmDto {
  @ApiProperty({ description: '재설정 토큰(메일로 받은 값)' })
  @IsString()
  readonly token!: string;

  @ApiProperty({ description: '새 비밀번호(8자 이상)' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  readonly newPassword!: string;
}

/** 이메일 인증 확정 */
export class EmailVerifyConfirmDto {
  @ApiProperty({ description: '이메일 인증 토큰' })
  @IsString()
  readonly token!: string;
}

/**
 * OAuth2 토큰 엔드포인트(/oauth/token) 요청.
 * - grant_type=authorization_code: code(소셜 릴레이 인가코드) 필요
 * - grant_type=refresh_token: refresh_token(없으면 httpOnly 쿠키에서 읽음)
 */
export class TokenRequestDto {
  @ApiProperty({
    description: 'grant 종류',
    enum: ['authorization_code', 'refresh_token'],
    example: 'authorization_code',
  })
  @IsIn(['authorization_code', 'refresh_token'])
  readonly grant_type!: 'authorization_code' | 'refresh_token';

  @ApiPropertyOptional({
    description: 'authorization_code grant 의 인가코드(ac_...)',
  })
  @IsOptional()
  @IsString()
  readonly code?: string;

  @ApiPropertyOptional({
    description:
      'refresh_token grant 의 refresh token(rt_...). 생략 시 httpOnly 쿠키에서 읽는다.',
  })
  @IsOptional()
  @IsString()
  readonly refresh_token?: string;
}

/** 로그인/토큰 응답. refresh token 은 httpOnly 쿠키로 내려가고 바디에는 담지 않는다. */
export class TokenResponseDto {
  @ApiProperty({ description: 'access token(JWT)' })
  readonly accessToken!: string;

  @ApiProperty({ description: '토큰 타입', example: 'Bearer' })
  readonly tokenType!: string;

  @ApiProperty({ description: 'access token 만료(초)', example: 3600 })
  readonly expiresIn!: number;
}

/** 내 정보 응답 */
export class MeResponseDto {
  @ApiProperty({ description: '회원번호' })
  readonly id!: number;

  @ApiProperty({ description: '이메일' })
  readonly email!: string;

  @ApiProperty({ description: '이메일 인증 여부' })
  readonly emailVerified!: boolean;

  @ApiPropertyOptional({ description: '표시 이름' })
  readonly name?: string | null;

  @ApiProperty({ description: '권한', example: 'USER' })
  readonly role!: string;

  @ApiProperty({ description: '최초 가입 수단', example: 'EMAIL' })
  readonly joinType!: string;
}
