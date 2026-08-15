import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AppClientType, AppReviewState, AppStatus } from '@hansapp/auth-application';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

// ---- 앱 ----

/** 이름 규칙(앱·클라이언트 공통): 영어 대소문자와 하이픈(-)만. */
const NAME_PATTERN = /^[a-zA-Z-]+$/;
const APP_NAME_PATTERN = NAME_PATTERN;
const APP_NAME_MESSAGE = 'name must contain only English letters and hyphens.';
const CLIENT_NAME_MESSAGE = 'name must contain only English letters and hyphens.';

/**
 * 앱 등록. **API 이용약관 동의가 반드시 실린다** — 없으면 서버가 거절한다.
 *
 * 가입 동의(ConsentDto)와 같은 이유다. 화면에서만 막으면 API 를 직접 부르는 경로가 남고,
 * 그러면 "동의를 안 받고 만들어 준" 앱이 생긴다. 판(version)을 함께 받아 화면이 실제로
 * 보여준 조문을 기록한다 — 서버의 현재 판과 다르면 거절한다(ConsentService 주석 참고).
 */
export class CreateAppDto {
  @ApiProperty({ description: '앱 이름(영어·하이픈)', example: 'my-service' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(APP_NAME_PATTERN, { message: APP_NAME_MESSAGE })
  readonly name!: string;

  @ApiProperty({
    description: '동의한 API 이용약관의 판(시행일)',
    example: '2026-08-14',
  })
  @IsString()
  @MaxLength(20)
  readonly apiTermsVersion!: string;
}

export class UpdateAppDto {
  @ApiPropertyOptional({
    description: '앱 이름(영어·하이픈)',
    example: 'my-service',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(APP_NAME_PATTERN, { message: APP_NAME_MESSAGE })
  readonly name?: string;

  @ApiPropertyOptional({ enum: AppStatus, description: '앱 상태' })
  @IsOptional()
  @IsEnum(AppStatus)
  readonly status?: AppStatus;
}

export class AppSummaryDto {
  @ApiProperty() readonly id!: number;
  @ApiProperty() readonly name!: string;
  @ApiProperty({ enum: AppStatus, description: '앱 상태' })
  readonly status!: AppStatus;
  @ApiProperty({
    enum: ['DRAFT', 'REVIEWING', 'REJECTED', 'APPROVED', 'DISABLED'],
    description:
      '심사 세부 상태(표시용). DRAFT=작성 중, REVIEWING=심사 중, REJECTED=거절됨, APPROVED=승인, DISABLED=삭제',
  })
  readonly reviewState!: AppReviewState;
  @ApiPropertyOptional({
    description: '거절 사유(REJECTED 일 때만). 사용자가 보고 고쳐 재요청한다.',
  })
  readonly rejectionReason?: string | null;
  @ApiPropertyOptional({ description: '삭제 시각(null 이면 삭제 안 됨)' })
  readonly deletedAt?: string | null;
  @ApiProperty({ description: '생성자 회원번호' }) readonly createdBy!: number;
  @ApiProperty() readonly createdAt!: string;
}

export class ApiKeySummaryDto {
  @ApiProperty() readonly id!: number;
  @ApiProperty() readonly name!: string;
  @ApiProperty({
    enum: AppStatus,
    description: 'PENDING 이면 승인 전이라 인증에 쓸 수 없다',
  })
  readonly status!: AppStatus;
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
  @ApiProperty({
    enum: AppStatus,
    description: 'PENDING 이면 승인 전이라 인증에 쓸 수 없다',
  })
  readonly status!: AppStatus;
  @ApiProperty({ enum: AppClientType, description: '플랫폼 타입' })
  readonly type!: AppClientType;
  // WEB
  @ApiPropertyOptional({
    type: [String],
    description: '[WEB] 승인된 JavaScript 원본',
  })
  readonly origins?: string[] | null;
  @ApiPropertyOptional({
    type: [String],
    description: '[WEB] 승인된 리디렉션 URI',
  })
  readonly redirectUris?: string[] | null;
  @ApiPropertyOptional({
    description: '[WEB] 보안 비밀번호 뒤 4자(마스킹 표기용)',
  })
  readonly secretSuffix?: string | null;
  @ApiPropertyOptional({ description: '[WEB] 보안 비밀번호 발급 시각' })
  readonly secretCreatedAt?: string | null;
  // NATIVE(iOS: {bundleId}, Android: {packageName, fingerprints[]})
  @ApiPropertyOptional({ description: '[NATIVE] 플랫폼 식별자', type: Object })
  readonly config?: Record<string, unknown> | null;
  @ApiPropertyOptional({ description: '마지막 사용 시각' })
  readonly lastUsedAt?: string | null;
  @ApiProperty() readonly createdAt!: string;
}

/** 클라이언트 생성 응답. secret(원문)은 WEB 일 때만, 이 응답에서만 확인 가능. */
export class CreatedClientDto extends ClientDto {
  @ApiPropertyOptional({
    description: '[WEB] 클라이언트 보안 비밀번호 원문. 다시 볼 수 없습니다.',
  })
  readonly secret?: string;
}

/** 시크릿 재발급 응답. */
export class SecretResponseDto {
  @ApiProperty({
    description: '새 보안 비밀번호 원문. 다시 볼 수 없습니다.',
  })
  readonly secret!: string;
}

export class AppDetailDto {
  @ApiProperty() readonly id!: number;
  @ApiProperty() readonly name!: string;
  @ApiProperty({ enum: AppStatus, description: '앱 상태' })
  readonly status!: AppStatus;
  @ApiProperty({
    enum: ['DRAFT', 'REVIEWING', 'REJECTED', 'APPROVED', 'DISABLED'],
    description:
      '심사 세부 상태(표시용). DRAFT=작성 중, REVIEWING=심사 중, REJECTED=거절됨, APPROVED=승인, DISABLED=삭제',
  })
  readonly reviewState!: AppReviewState;
  @ApiPropertyOptional({
    description: '거절 사유(REJECTED 일 때만). 사용자가 보고 고쳐 재요청한다.',
  })
  readonly rejectionReason?: string | null;
  @ApiPropertyOptional({ description: '삭제 시각(null 이면 삭제 안 됨)' })
  readonly deletedAt?: string | null;
  @ApiProperty({ description: '생성자 회원번호' }) readonly createdBy!: number;
  @ApiProperty() readonly createdAt!: string;
  @ApiProperty({ description: '서비스 키 발급 상한' })
  readonly apiKeyLimit!: number;
  @ApiProperty({ type: [ApiKeySummaryDto] })
  readonly apiKeys!: ApiKeySummaryDto[];
  @ApiProperty({ type: [ClientDto] }) readonly clients!: ClientDto[];
}

// ---- API 키 ----

export class CreateApiKeyDto {
  @ApiProperty({ description: '키 이름(용도 구분)', example: 'server-prod' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  readonly name!: string;
}

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
  @ApiProperty({ enum: AppClientType, description: '플랫폼 타입' })
  @IsEnum(AppClientType)
  readonly type!: AppClientType;

  @ApiProperty({ description: '클라이언트 이름(영어·하이픈)', example: 'web' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(NAME_PATTERN, { message: CLIENT_NAME_MESSAGE })
  readonly name!: string;

  @ApiPropertyOptional({
    description:
      'Client ID 직접 지정(소문자·숫자·하이픈, 2~30자). 저장 시 cl_fixed_ 접두사가 붙는다. 비우면 cl_{appId}_{id}-{랜덤} 자동 발급. 멀티 환경에서 값을 고정하려면 지정.',
    example: 'medifinder-web',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{1,29}$/, {
    message:
      'clientId must be 2-30 characters of lowercase letters, digits, or hyphens, and cannot start with a hyphen.',
  })
  readonly clientId?: string;

  // ---- WEB ----
  @ApiPropertyOptional({
    type: [String],
    description: '[WEB] 자바스크립트 원본(scheme://host[:port])',
    example: ['https://app.example.com'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  readonly origins?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: '[WEB] 로그인 후 복귀 허용 URL',
    example: ['https://app.example.com/auth/callback'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  readonly redirectUris?: string[];

  // ---- iOS ----
  @ApiPropertyOptional({
    description: '[iOS] Bundle ID',
    example: 'com.example.app',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  readonly bundleId?: string;

  @ApiPropertyOptional({
    description: '[iOS] Apple Team ID (Universal Links 검증용)',
    example: 'ABCDE12345',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  readonly teamId?: string;

  // ---- Android ----
  @ApiPropertyOptional({
    description: '[Android] 패키지명',
    example: 'com.example.app',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  readonly packageName?: string;

  @ApiPropertyOptional({
    type: [String],
    description: '[Android] SHA-256 인증서 지문',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  readonly fingerprints?: string[];
}

export class UpdateClientDto {
  @ApiPropertyOptional({ description: '클라이언트 이름(영어·하이픈)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(NAME_PATTERN, { message: CLIENT_NAME_MESSAGE })
  readonly name?: string;

  @ApiPropertyOptional({ type: [String], description: '[WEB]' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  readonly origins?: string[];

  @ApiPropertyOptional({ type: [String], description: '[WEB]' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  readonly redirectUris?: string[];

  @ApiPropertyOptional({ description: '[iOS] Bundle ID' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  readonly bundleId?: string;

  @ApiPropertyOptional({ description: '[iOS] Apple Team ID' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  readonly teamId?: string;

  @ApiPropertyOptional({ description: '[Android] 패키지명' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  readonly packageName?: string;

  @ApiPropertyOptional({
    type: [String],
    description: '[Android] SHA-256 지문',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  readonly fingerprints?: string[];
}
