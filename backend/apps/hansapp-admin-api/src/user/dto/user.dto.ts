import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
} from 'class-validator';
import { UserStatus } from '@hansapp/admin-application';
import type {
  UserDetail,
  UserOAuthSummary,
  UserSummary,
} from '@hansapp/admin-application';

/** 목록 조회 조건. */
export class UserListQueryDto {
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

  @ApiPropertyOptional({ description: '이메일·이름 부분 일치' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  readonly keyword?: string;

  @ApiPropertyOptional({ description: '계정 상태', enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  readonly status?: UserStatus;
}

export class UserSummaryDto {
  @ApiProperty({ description: '회원번호' }) readonly id!: number;
  @ApiProperty({ description: '이메일' }) readonly email!: string;
  @ApiPropertyOptional({ description: '표시 이름' })
  readonly name!: string | null;
  @ApiProperty({ description: '계정 상태', enum: UserStatus })
  readonly status!: UserStatus;
  @ApiProperty({ description: '권한' }) readonly role!: string;
  @ApiProperty({ description: '등급' }) readonly tier!: string;
  @ApiProperty({ description: '가입 수단' }) readonly joinType!: string;
  @ApiProperty({ description: '이메일 검증 여부' })
  readonly emailVerified!: boolean;
  @ApiProperty({ description: '가입 시각(ISO 8601)' })
  readonly createdAt!: string;

  constructor(user: UserSummary) {
    this.id = user.id;
    this.email = user.email;
    this.name = user.name;
    this.status = user.status;
    this.role = user.role;
    this.tier = user.tier;
    this.joinType = user.joinType;
    this.emailVerified = user.emailVerified;
    this.createdAt = user.createdAt.toISOString();
  }
}

export class UserOAuthDto {
  @ApiProperty({ description: '소셜 provider' }) readonly provider!: string;
  @ApiPropertyOptional({ description: 'provider 가 준 이메일' })
  readonly email!: string | null;
  @ApiProperty({ description: '연동 시각(ISO 8601)' })
  readonly connectedAt!: string;

  constructor(oauth: UserOAuthSummary) {
    this.provider = oauth.provider;
    this.email = oauth.email;
    this.connectedAt = oauth.connectedAt.toISOString();
  }
}

export class UserDetailDto extends UserSummaryDto {
  @ApiProperty({ description: '최종 수정 시각(ISO 8601)' })
  readonly updatedAt!: string;

  @ApiPropertyOptional({ description: '탈퇴 시각(ISO 8601). 활성 계정은 null' })
  readonly withdrawnAt!: string | null;

  @ApiProperty({
    description:
      '이메일 로그인이 가능한 계정인지. 소셜 전용 계정은 false. **해시는 내보내지 않는다.**',
  })
  readonly hasPassword!: boolean;

  @ApiProperty({ description: '연동된 소셜 계정', type: [UserOAuthDto] })
  readonly oauths!: UserOAuthDto[];

  @ApiProperty({ description: '살아 있는 로그인 세션 수' })
  readonly activeSessionCount!: number;

  @ApiProperty({ description: '소유·참여 중인 앱 수' })
  readonly appCount!: number;

  constructor(user: UserDetail) {
    super(user);
    this.updatedAt = user.updatedAt.toISOString();
    this.withdrawnAt = user.withdrawnAt?.toISOString() ?? null;
    this.hasPassword = user.hasPassword;
    this.oauths = user.oauths.map((o) => new UserOAuthDto(o));
    this.activeSessionCount = user.activeSessionCount;
    this.appCount = user.appCount;
  }
}
