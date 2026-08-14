import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsNotEmptyObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { ClientLocaleDto, ConsentDto } from './auth.dto';

/** 소셜 pending 가입 확정 요청. provider 가 이메일을 안 줬으면 email 을 사용자가 입력한다. */
export class SocialRegisterRequestDto {
  @ApiProperty({ description: '콜백에서 받은 소셜 가입 티켓' })
  @IsString()
  readonly ticket!: string;

  @ApiPropertyOptional({
    description:
      '사용자가 고른 이메일. provider 가 이메일을 주지 않았거나(email_required), ' +
      '준 값이 검증된 것이 아닐 때(email_editable) 쓴다. ' +
      'provider 가 검증한 이메일이 있으면 그 값이 우선한다.',
  })
  @IsOptional()
  @IsEmail()
  readonly email?: string;

  @ApiPropertyOptional({
    description: '사용자가 고른 표시 이름. 비우면 provider 가 준 이름을 쓴다.',
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  readonly name?: string;

  @ApiPropertyOptional({
    description: 'provider 가 이메일을 검증하지 않은 경우(code_required) 메일로 받은 인증 코드',
  })
  @IsOptional()
  @IsString()
  readonly code?: string;

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

/** 소셜 가입 코드 발송 요청. provider 가 이메일을 안 준 경우 email 을 함께 보낸다. */
export class SocialRegisterCodeRequestDto {
  @ApiProperty({ description: '콜백에서 받은 소셜 가입 티켓' })
  @IsString()
  readonly ticket!: string;

  @ApiPropertyOptional({
    description:
      '사용자가 고른 이메일. provider 가 이메일을 주지 않았거나(email_required), ' +
      '준 값이 검증된 것이 아닐 때(email_editable) 쓴다. ' +
      'provider 가 검증한 이메일이 있으면 그 값이 우선한다.',
  })
  @IsOptional()
  @IsEmail()
  readonly email?: string;

  @ApiPropertyOptional({
    description: '사용자가 고른 표시 이름. 비우면 provider 가 준 이름을 쓴다.',
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  readonly name?: string;
}

/** 연동 시작 토큰 응답. 프론트가 GET /auth/:provider?link_token= 로 넘겨 연동을 시작한다. */
export class LinkPrepareResponseDto {
  @ApiProperty({ description: '연동 시작 토큰(단기)' })
  readonly linkToken!: string;
}
