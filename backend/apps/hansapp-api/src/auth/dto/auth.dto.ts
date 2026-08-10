import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmptyObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * 가입 동의. **가입 요청에 반드시 실린다** — 없으면 서버가 거절한다.
 *
 * 화면에서만 막으면 API 를 직접 부르는 경로가 남고, 그러면 "우리가 동의를 안 받고 만든" 계정이
 * 생긴다. 동의를 받았다는 입증 책임이 처리자에게 있어서 그 계정은 나중에 설명할 방법이 없다.
 *
 * 판(version)을 함께 받는 이유는 화면이 실제로 보여준 조문을 기록하기 위해서다 —
 * 서버의 현재 판과 다르면 거절한다(ConsentService 주석 참고).
 */
export class ConsentDto {
  @ApiProperty({
    description: '동의한 이용약관의 판(시행일)',
    example: '2026-08-06',
  })
  @IsString()
  @MaxLength(20)
  readonly termsVersion!: string;

  @ApiProperty({
    description: '동의한 개인정보처리방침의 판(시행일)',
    example: '2026-08-06',
  })
  @IsString()
  @MaxLength(20)
  readonly privacyVersion!: string;
}

/**
 * 가입 시점의 지역 설정. 브라우저에서 뽑아 보낸다.
 *
 * 서버는 이 값을 **그대로 믿지 않고** 지원 언어·실재하는 타임존으로 좁힌 뒤 저장한다.
 * 국가를 따로 받지 않는 것은 브라우저가 주지 않기 때문이다 — 타임존에서 되짚는다.
 */
export class ClientLocaleDto {
  @ApiPropertyOptional({
    description: '언어 태그(BCP-47). 지원 언어(ko/en/ja/zh)로 좁혀 저장된다.',
    example: 'ko-KR',
  })
  @IsOptional()
  @IsString()
  @MaxLength(35)
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

/** 가입 인증 코드 발송 요청(계정 생성 전) */
export class SignupCodeRequestDto {
  @ApiProperty({ description: '가입할 이메일', example: 'user@example.com' })
  @IsEmail()
  @MaxLength(320)
  readonly email!: string;
}

/** 이메일 가입 요청. 사전에 발송된 인증 코드를 함께 보낸다. */
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

  @ApiProperty({ description: '표시 이름', example: '홍길동' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  readonly name!: string;

  @ApiProperty({ description: '메일로 받은 인증 코드', example: '846210' })
  @IsString()
  @MinLength(4)
  @MaxLength(12)
  readonly code!: string;

  @ApiProperty({ description: '약관·개인정보·연령 동의', type: ConsentDto })
  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => ConsentDto)
  readonly consent!: ConsentDto;

  @ApiPropertyOptional({
    description: '브라우저에서 뽑은 언어·타임존. 없으면 비워 둔다.',
    type: ClientLocaleDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ClientLocaleDto)
  readonly clientLocale?: ClientLocaleDto;
}

/** 이메일 로그인 요청 */
export class LoginRequestDto {
  @ApiProperty({ description: '이메일', example: 'user@example.com' })
  @IsEmail()
  readonly email!: string;

  @ApiProperty({ description: '비밀번호', example: 'p@ssw0rd!' })
  @IsString()
  // 가입과 같은 상한. bcrypt 는 72바이트 뒤를 버리므로 그 너머는 받아도 의미가 없다.
  @MaxLength(72)
  readonly password!: string;

  @ApiPropertyOptional({
    description:
      '로그인 상태 유지. 켜면 브라우저를 닫아도 로그인이 남고, 끄면(기본) 닫을 때 사라진다.',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  readonly rememberMe?: boolean;
}

/** 비밀번호 재설정 요청(가입 이메일로 인증 코드 발송) */
export class PasswordResetRequestDto {
  @ApiProperty({ description: '가입 이메일' })
  @IsEmail()
  readonly email!: string;
}

/** 비밀번호 재설정 확정. 메일로 받은 인증 코드로 새 비밀번호를 설정한다. */
export class PasswordResetConfirmDto {
  @ApiProperty({ description: '가입 이메일' })
  @IsEmail()
  readonly email!: string;

  @ApiProperty({ description: '메일로 받은 인증 코드', example: '846210' })
  @IsString()
  @MinLength(4)
  @MaxLength(12)
  readonly code!: string;

  @ApiProperty({ description: '새 비밀번호(8자 이상)' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  readonly newPassword!: string;
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

  @ApiPropertyOptional({
    description:
      'PKCE code_verifier(RFC 7636). authorization_code grant 에 **필수**다. ' +
      '인가 요청 때 보낸 code_challenge 의 원본으로, BASE64URL(SHA256(이 값)) 이 일치해야 한다.',
    example: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
  })
  @IsOptional()
  @IsString()
  readonly code_verifier?: string;
}

/**
 * 로그인/토큰 응답.
 * refresh token 은 httpOnly 쿠키로도 내려가지만(웹 전용 보호), 모바일·크로스플랫폼 스토리지
 * 보관을 위해 **바디에도 함께 담는다.** 클라이언트는 편한 쪽을 쓴다.
 */
export class TokenResponseDto {
  @ApiProperty({ description: 'access token(JWT)' })
  readonly accessToken!: string;

  @ApiProperty({ description: '토큰 타입', example: 'Bearer' })
  readonly tokenType!: string;

  @ApiProperty({ description: 'access token 만료(초)', example: 3600 })
  readonly expiresIn!: number;

  @ApiProperty({
    description:
      'refresh token(불투명, rt_...). **1회용이다** — 이 값으로 갱신하면 새 refresh token 이 ' +
      '발급되고 이 값은 그 즉시 무효가 된다. 응답을 받으면 반드시 새 값으로 교체해 보관할 것.',
  })
  readonly refreshToken!: string;

  @ApiProperty({
    description: 'refresh token 만료 시각(ISO8601)',
    example: '2026-09-20T12:00:00.000Z',
  })
  readonly refreshExpiresAt!: string;
}

/**
 * SSO 인가코드 발급 요청. 로그인된 사용자가 다른 클라이언트(앱)로 로그인을 릴레이할 때,
 * 그 앱의 복귀 URL(return_to)로 넘길 1회용 코드를 요청한다.
 */
export class AuthorizeRequestDto {
  @ApiProperty({
    description:
      'OAuth2 redirect_uri — 코드를 실어 돌려보낼 클라이언트 URL. clientId 를 주면 그 클라이언트에 ' +
      '등록된 리디렉션 URI 와 정확히 일치해야 하고, 없으면 1st-party 허용목록 오리진이어야 한다.',
    example: 'https://medifinder.kr/auth/callback',
  })
  @IsString()
  readonly redirectUri!: string;

  @ApiPropertyOptional({
    description:
      '외부 앱의 공개 클라이언트 ID. 생략하면 1st-party(인증웹 자신)로 간주한다. ' +
      '이 값은 발급되는 코드에 기록되어, 토큰 교환 때 요청 Origin 대조의 기준이 된다.',
    example: 'cl_fixed_medifinder',
  })
  @IsOptional()
  @IsString()
  readonly clientId?: string;

  @ApiProperty({
    description:
      'PKCE code_challenge = BASE64URL(SHA256(code_verifier)), 43자. S256 만 받는다. ' +
      '발급되는 코드에 기록되어 교환 때 code_verifier 와 대조된다.',
    example: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
  })
  @IsString()
  readonly codeChallenge!: string;
}

/** SSO 인가코드 응답. 클라이언트는 이 code 를 /oauth/token 으로 교환한다. */
export class AuthorizeResponseDto {
  @ApiProperty({ description: '1회용 인가코드(ac_...)' })
  readonly code!: string;
}
