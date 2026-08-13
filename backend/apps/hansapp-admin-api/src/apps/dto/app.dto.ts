import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AppStatus, REJECTION_REASON_MAX_LENGTH } from '@hansapp/admin-application';
import type {
  AppApiKeySummary,
  AppClientSummary,
  AppDetail,
  AppMemberSummary,
  AppSummary,
} from '@hansapp/admin-application';

export class AppListQueryDto {
  @ApiPropertyOptional({ description: '페이지 번호(1부터)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  readonly page: number = 1;

  @ApiPropertyOptional({
    description: '페이지 크기',
    default: 20,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  // 상한을 두지 않으면 size=100000 한 방으로 전체를 긁어갈 수 있다.
  @Max(100)
  readonly size: number = 20;

  @ApiPropertyOptional({ description: '앱 이름 또는 소유자 이메일 부분 일치' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  readonly keyword?: string;

  @ApiPropertyOptional({ description: '앱 상태', enum: AppStatus })
  @IsOptional()
  @IsEnum(AppStatus)
  readonly status?: AppStatus;

  @ApiPropertyOptional({
    description: '삭제된 앱도 포함할지. 기본은 제외.',
    default: false,
  })
  @IsOptional()
  // 쿼리스트링은 전부 문자열이라 'true'/'false' 를 불리언으로 바꿔 준다.
  @Type(() => Boolean)
  @IsBoolean()
  readonly includeDeleted?: boolean;
}

export class AppRejectRequestDto {
  @ApiProperty({
    description: '거절 사유. 앱 소유자에게 그대로 노출된다.',
    maxLength: REJECTION_REASON_MAX_LENGTH,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(REJECTION_REASON_MAX_LENGTH)
  readonly reason!: string;
}

class AppOwnerDto {
  @ApiProperty({ description: '회원번호' }) readonly id!: number;
  @ApiProperty({ description: '이메일' }) readonly email!: string;
  @ApiPropertyOptional({ description: '표시 이름' })
  readonly name!: string | null;

  constructor(user: AppMemberSummary) {
    this.id = user.id;
    this.email = user.email;
    this.name = user.name;
  }
}

export class AppSummaryDto {
  @ApiProperty({ description: '앱 id' }) readonly id!: number;
  @ApiProperty({ description: '앱 이름' }) readonly name!: string;
  @ApiProperty({ description: '앱 상태', enum: AppStatus })
  readonly status!: AppStatus;

  @ApiPropertyOptional({
    description: '심사 요청 시각(ISO 8601). PENDING 일 때만 의미가 있다.',
  })
  readonly reviewRequestedAt!: string | null;

  @ApiPropertyOptional({
    description: '거절 사유. PENDING + 이 값이 있으면 거절된 앱이다.',
  })
  readonly rejectionReason!: string | null;

  @ApiPropertyOptional({ description: '삭제 시각(ISO 8601). 살아 있으면 null' })
  readonly deletedAt!: string | null;

  @ApiPropertyOptional({ description: '소유자(OWNER 멤버)', type: AppOwnerDto })
  readonly owner!: AppOwnerDto | null;

  @ApiProperty({ description: '서비스 키 수' }) readonly apiKeyCount!: number;
  @ApiProperty({ description: 'OAuth 클라이언트 수' })
  readonly clientCount!: number;
  @ApiProperty({ description: '멤버 수' }) readonly memberCount!: number;
  @ApiProperty({ description: '등록 시각(ISO 8601)' })
  readonly createdAt!: string;

  constructor(app: AppSummary) {
    this.id = app.id;
    this.name = app.name;
    this.status = app.status;
    this.reviewRequestedAt = app.reviewRequestedAt?.toISOString() ?? null;
    this.rejectionReason = app.rejectionReason;
    this.deletedAt = app.deletedAt?.toISOString() ?? null;
    this.owner = app.owner ? new AppOwnerDto(app.owner) : null;
    this.apiKeyCount = app.apiKeyCount;
    this.clientCount = app.clientCount;
    this.memberCount = app.memberCount;
    this.createdAt = app.createdAt.toISOString();
  }
}

class AppApiKeyDto {
  @ApiProperty({ description: '키 id' }) readonly id!: number;
  @ApiProperty({ description: '키 이름' }) readonly name!: string;
  @ApiProperty({
    description: '표시용 접두사. **원문도 해시도 내보내지 않는다.**',
  })
  readonly keyPrefix!: string;
  @ApiProperty({ description: '상태', enum: AppStatus })
  readonly status!: AppStatus;
  @ApiPropertyOptional({ description: '마지막 사용(ISO 8601)' })
  readonly lastUsedAt!: string | null;
  @ApiProperty({ description: '발급 시각(ISO 8601)' })
  readonly createdAt!: string;

  constructor(key: AppApiKeySummary) {
    this.id = key.id;
    this.name = key.name;
    this.keyPrefix = key.keyPrefix;
    this.status = key.status;
    this.lastUsedAt = key.lastUsedAt?.toISOString() ?? null;
    this.createdAt = key.createdAt.toISOString();
  }
}

class AppClientDto {
  @ApiProperty({ description: '내부 id' }) readonly id!: number;
  @ApiProperty({ description: '공개 클라이언트 식별자' })
  readonly clientId!: string;
  @ApiProperty({ description: '클라이언트 이름' }) readonly name!: string;
  @ApiProperty({ description: '플랫폼(WEB·IOS·ANDROID)' })
  readonly type!: string;
  @ApiProperty({ description: 'JS 허용 원본(WEB)', type: [String] })
  readonly origins!: string[];
  @ApiProperty({ description: '복귀 허용 경로(WEB)', type: [String] })
  readonly redirectUris!: string[];
  @ApiPropertyOptional({
    description: 'client secret 뒤 4자(마스킹 표기용). 해시는 내보내지 않는다. 네이티브는 null',
  })
  readonly secretSuffix!: string | null;
  @ApiPropertyOptional({
    description: 'client secret 발급·재발급 시각(ISO 8601)',
  })
  readonly secretCreatedAt!: string | null;
  @ApiPropertyOptional({
    description:
      '네이티브 플랫폼 식별자. iOS={bundleId}, Android={packageName,fingerprints[]}. 웹은 null',
    type: 'object',
    additionalProperties: true,
  })
  readonly config!: Record<string, unknown> | null;
  @ApiProperty({ description: '상태', enum: AppStatus })
  readonly status!: AppStatus;
  @ApiPropertyOptional({ description: '마지막 사용(ISO 8601)' })
  readonly lastUsedAt!: string | null;
  @ApiProperty({ description: '등록 시각(ISO 8601)' })
  readonly createdAt!: string;

  constructor(client: AppClientSummary) {
    this.id = client.id;
    this.clientId = client.clientId;
    this.name = client.name;
    this.type = client.type;
    this.origins = client.origins;
    this.redirectUris = client.redirectUris;
    this.secretSuffix = client.secretSuffix;
    this.secretCreatedAt = client.secretCreatedAt?.toISOString() ?? null;
    this.config = client.config;
    this.status = client.status;
    this.lastUsedAt = client.lastUsedAt?.toISOString() ?? null;
    this.createdAt = client.createdAt.toISOString();
  }
}

class AppMemberDto {
  @ApiProperty({ description: '역할(OWNER·ADMIN·MEMBER)' })
  readonly role!: string;
  @ApiProperty({ description: '참여 시각(ISO 8601)' })
  readonly joinedAt!: string;
  @ApiPropertyOptional({ description: '회원', type: AppOwnerDto })
  readonly user!: AppOwnerDto | null;

  constructor(member: AppDetail['members'][number]) {
    this.role = member.role;
    this.joinedAt = member.joinedAt.toISOString();
    this.user = member.user ? new AppOwnerDto(member.user) : null;
  }
}

export class AppDetailDto extends AppSummaryDto {
  @ApiProperty({ description: '서비스 키 발급 상한' })
  readonly apiKeyLimit!: number;

  @ApiProperty({ description: '최종 수정(ISO 8601)' })
  readonly updatedAt!: string;

  @ApiProperty({ description: '멤버', type: [AppMemberDto] })
  readonly members!: AppMemberDto[];

  @ApiProperty({ description: '서비스 키', type: [AppApiKeyDto] })
  readonly apiKeys!: AppApiKeyDto[];

  @ApiProperty({ description: 'OAuth 클라이언트', type: [AppClientDto] })
  readonly clients!: AppClientDto[];

  constructor(app: AppDetail) {
    super(app);
    this.apiKeyLimit = app.apiKeyLimit;
    this.updatedAt = app.updatedAt.toISOString();
    this.members = app.members.map((m) => new AppMemberDto(m));
    this.apiKeys = app.apiKeys.map((k) => new AppApiKeyDto(k));
    this.clients = app.clients.map((c) => new AppClientDto(c));
  }
}
