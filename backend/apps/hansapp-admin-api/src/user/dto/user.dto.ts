import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
} from 'class-validator';
import {
  AuthLogResult,
  AuthLogAction,
  UserStatus,
} from '@hansapp/admin-application';
import type {
  ProfileCacheState,
  UserAuthLogEntry,
  UserDetail,
  UserOAuthSummary,
  UserSession,
  UserSummary,
} from '@hansapp/admin-application';

/**
 * 인증 기록 조회 조건.
 *
 * **기본은 전체 기간·전체 액션이다.** 관리자가 이 화면을 여는 이유는 대개 "무슨 일이
 * 있었나" 라서, 처음부터 좁혀 놓으면 찾으려던 것이 화면 밖에 있다.
 */
export class UserAuthLogQueryDto {
  @ApiPropertyOptional({ description: '페이지 번호(1부터)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  readonly page: number = 1;

  @ApiPropertyOptional({
    description: '페이지 크기',
    default: 30,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  readonly size: number = 30;

  @ApiPropertyOptional({
    description: '시작 시각(ISO 8601, 포함). 없으면 처음부터.',
    example: '2026-08-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601()
  readonly from?: string;

  @ApiPropertyOptional({
    description: '종료 시각(ISO 8601, 포함). 없으면 지금까지.',
    example: '2026-08-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsISO8601()
  readonly to?: string;

  @ApiPropertyOptional({
    description:
      '볼 액션. 쉼표로 여러 개(`LOGIN,LOGOUT`) 또는 같은 이름을 반복해 보낸다. 없으면 전부.',
    enum: AuthLogAction,
    isArray: true,
  })
  @IsOptional()
  /*
    쿼리스트링은 값이 하나면 문자열, 여럿이면 배열로 온다. 게다가 화면은 쉼표로 묶어
    보내는 편이 URL 이 짧아 그쪽을 쓴다 — 세 모양을 여기서 배열 하나로 맞춰 둔다.
  */
  @Transform(({ value }) => {
    /*
      **없을 때 손대지 않는다.** class-transformer 는 값이 안 실린 프로퍼티에도 이 함수를
      부르는데, 여기서 배열을 만들어 돌려주면 `@IsOptional` 이 건너뛸 기회를 잃고
      "빈 배열" 이나 `['undefined']` 가 검증에 걸린다.
    */
    if (value == null) return undefined;
    const parsed = (Array.isArray(value) ? value : [value])
      .flatMap((item: unknown) => String(item).split(','))
      .map((item) => item.trim())
      .filter(Boolean);
    // `actions=` 처럼 빈 값으로 오면 "전체" 다. 빈 배열은 조건이 아니라 없는 것으로 본다.
    return parsed.length ? parsed : undefined;
  })
  @IsEnum(AuthLogAction, { each: true })
  readonly actions?: AuthLogAction[];
}

/** 인증 기록 한 줄. */
export class UserAuthLogDto {
  @ApiProperty({
    description: '로그 식별자. BigInt 라 문자열로 준다.',
    example: '10482',
  })
  readonly id!: string;

  @ApiProperty({ description: '이벤트 종류', enum: AuthLogAction })
  readonly action!: AuthLogAction;

  @ApiProperty({ description: '결과', enum: AuthLogResult })
  readonly result!: AuthLogResult;

  @ApiPropertyOptional({ description: '로그인·가입·연동에 쓴 수단' })
  readonly provider!: string | null;

  @ApiPropertyOptional({ description: '실패 사유. 성공이면 없다.' })
  readonly failReason!: string | null;

  @ApiPropertyOptional({ description: '접속 IP' })
  readonly ip!: string | null;

  @ApiPropertyOptional({ description: '접속 기기 정보' })
  readonly userAgent!: string | null;

  @ApiPropertyOptional({
    description:
      '액션별 부가정보. **모양이 액션마다 다르다** — 정해진 필드가 없고, 없으면 빠진다.',
    type: 'object',
    additionalProperties: true,
  })
  readonly detail!: unknown;

  @ApiProperty({ description: '발생 시각(ISO 8601)' })
  readonly createdAt!: string;

  constructor(entry: UserAuthLogEntry) {
    this.id = entry.id;
    this.action = entry.action;
    this.result = entry.result;
    this.provider = entry.provider;
    this.failReason = entry.failReason;
    this.ip = entry.ip;
    this.userAgent = entry.userAgent;
    this.detail = entry.detail;
    this.createdAt = entry.createdAt.toISOString();
  }
}

/**
 * 회원 정보 수정 요청. **보낸 항목만 바뀐다.**
 *
 * 지금 고칠 수 있는 것은 표시 이름뿐이다 — 이메일·인증 여부·등급을 왜 안 여는지는
 * UserAdminService 주석에 적어 두었다.
 */
export class UpdateUserRequestDto {
  @ApiPropertyOptional({
    description: '표시 이름. 빈 문자열을 보내면 지운다.',
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  readonly name?: string;
}

/** 내 정보 캐시 상태. **글 캐시(PostCacheStateDto)와 같은 모양이다** — 콘솔이 같은 패널로 본다. */
export class ProfileCacheStateDto {
  @ApiProperty({ description: '캐시 키. 환경 접두어는 빠져 있다.' })
  readonly key!: string;

  @ApiProperty({ description: '지금 캐시에 들어 있나' })
  readonly hit!: boolean;

  @ApiProperty({ nullable: true, description: '만료 시각' })
  readonly expiresAt!: string | null;

  @ApiProperty({ nullable: true, description: '남은 시간(ms)' })
  readonly remainingMs!: number | null;

  @ApiProperty({
    nullable: true,
    description: '캐시에 담긴 값 그대로. 없으면 null.',
  })
  readonly value!: unknown;

  @ApiProperty({
    description:
      'Redis 처럼 프로세스 밖에서 공유되는 캐시인가. false 면 이 프로세스의 메모리라, ' +
      '회원 API 가 다른 프로세스면 그쪽 캐시는 여기서 보이지도 지워지지도 않는다.',
  })
  readonly shared!: boolean;

  constructor(state: ProfileCacheState) {
    this.key = state.key;
    this.hit = state.hit;
    this.expiresAt = state.expiresAt?.toISOString() ?? null;
    this.remainingMs = state.remainingMs;
    this.value = state.value;
    this.shared = state.shared;
  }
}

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

/**
 * 로그인해 둔 기기 한 줄.
 *
 * **세션 식별자를 담는다.** 관리자가 기기 한 대를 끊을 수 있어야 해서다 — 끊을 대상을
 * 가리키는 값이 없으면 "전부 끊기" 밖에 못 한다.
 *
 * 이 값만으로는 로그인할 수 없다. refresh token 은 `sid + secret` 인데 secret 은 해시로만
 * 저장되고 어디에도 나가지 않는다(token.service 의 rotateRefreshToken 참고).
 */
export class UserSessionDto {
  @ApiProperty({ description: '세션 식별자. 이 기기를 끊을 때 쓴다.' })
  readonly sessionId!: string;

  @ApiPropertyOptional({ description: '접속 기기의 브라우저·운영체제 정보' })
  readonly userAgent!: string | null;

  @ApiPropertyOptional({ description: '접속 IP' })
  readonly ip!: string | null;

  @ApiProperty({
    description: '"로그인 상태 유지" 를 켜고 만든 세션인지',
  })
  readonly persistent!: boolean;

  @ApiProperty({ description: '이 기기에서 로그인한 시각(ISO 8601)' })
  readonly createdAt!: string;

  @ApiProperty({
    description: '마지막 갱신 시각(ISO 8601). 사실상 최근 활동 시각이다.',
  })
  readonly updatedAt!: string;

  @ApiProperty({ description: '만료 시각(ISO 8601)' })
  readonly expiresAt!: string;

  constructor(session: UserSession) {
    this.sessionId = session.sessionId;
    this.userAgent = session.userAgent;
    this.ip = session.ip;
    this.persistent = session.persistent;
    this.createdAt = session.createdAt.toISOString();
    this.updatedAt = session.updatedAt.toISOString();
    this.expiresAt = session.expiresAt.toISOString();
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
