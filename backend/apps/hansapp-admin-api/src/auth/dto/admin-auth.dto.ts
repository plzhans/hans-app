import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

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
}
