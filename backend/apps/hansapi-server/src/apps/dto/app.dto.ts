import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

// ---- 앱 ----

export class CreateAppDto {
  @ApiProperty({ description: '앱 이름', example: '내 서비스' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  readonly name!: string;
}

export class UpdateAppDto {
  @ApiProperty({ description: '앱 이름', example: '내 서비스' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  readonly name!: string;
}

export class AppSummaryDto {
  @ApiProperty() readonly id!: number;
  @ApiProperty() readonly name!: string;
  @ApiProperty({ description: '생성자 회원번호' }) readonly createdBy!: number;
  @ApiProperty() readonly createdAt!: string;
}

export class ApiKeySummaryDto {
  @ApiProperty() readonly id!: number;
  @ApiProperty() readonly name!: string;
  @ApiProperty({ description: '표시용 접두사(원문은 생성 시 1회만 확인 가능)' })
  readonly keyPrefix!: string;
  @ApiPropertyOptional() readonly lastUsedAt?: string | null;
  @ApiProperty() readonly createdAt!: string;
}

export class ClientDto {
  @ApiProperty() readonly id!: number;
  @ApiProperty({ description: '공개 클라이언트 식별자' })
  readonly clientId!: string;
  @ApiProperty() readonly name!: string;
  @ApiProperty({ type: [String], description: '승인된 JavaScript 원본' })
  readonly origins!: string[];
  @ApiProperty({ type: [String], description: '승인된 리디렉션 URI' })
  readonly redirectUris!: string[];
  @ApiProperty({ description: '보안 비밀번호 뒤 4자(마스킹 표기용)' })
  readonly secretSuffix!: string;
  @ApiProperty({ description: '보안 비밀번호 발급 시각' })
  readonly secretCreatedAt!: string;
  @ApiPropertyOptional({ description: '마지막 사용 시각' })
  readonly lastUsedAt?: string | null;
  @ApiProperty() readonly createdAt!: string;
}

/** 클라이언트 생성 응답. secret(원문)은 이 응답에서만 확인 가능. */
export class CreatedClientDto extends ClientDto {
  @ApiProperty({
    description: '클라이언트 보안 비밀번호 원문(cs_...). 다시 볼 수 없습니다.',
  })
  readonly secret!: string;
}

/** 시크릿 재발급 응답. */
export class SecretResponseDto {
  @ApiProperty({
    description: '새 보안 비밀번호 원문(cs_...). 다시 볼 수 없습니다.',
  })
  readonly secret!: string;
}

export class AppDetailDto {
  @ApiProperty() readonly id!: number;
  @ApiProperty() readonly name!: string;
  @ApiProperty({ description: '생성자 회원번호' }) readonly createdBy!: number;
  @ApiProperty() readonly createdAt!: string;
  @ApiProperty({ type: [ApiKeySummaryDto] })
  readonly apiKeys!: ApiKeySummaryDto[];
  @ApiProperty({ type: [ClientDto] }) readonly clients!: ClientDto[];
}

// ---- API 키 ----

/** 키 발급 응답. key(원문)는 이 응답에서만 확인 가능하다. */
export class CreatedApiKeyDto {
  @ApiProperty() readonly id!: number;
  @ApiProperty() readonly name!: string;
  @ApiProperty({
    description: 'API 키 원문(sk_...). 다시 볼 수 없으니 안전하게 보관하세요.',
  })
  readonly key!: string;
  @ApiProperty() readonly keyPrefix!: string;
  @ApiProperty() readonly createdAt!: string;
}

// ---- 클라이언트 ----

export class CreateClientDto {
  @ApiProperty({ description: '클라이언트 이름', example: 'web' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  readonly name!: string;

  @ApiProperty({
    type: [String],
    description: '자바스크립트 원본(scheme://host[:port])',
    example: ['https://app.example.com'],
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  readonly origins!: string[];

  @ApiProperty({
    type: [String],
    description: '로그인 후 복귀 허용 URL',
    example: ['https://app.example.com/auth/callback'],
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  readonly redirectUris!: string[];
}

export class UpdateClientDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  readonly name?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  readonly origins?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  readonly redirectUris?: string[];
}
