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
import { SUPPORTED_LANGS } from '@hansapp/common';
import {
  AppStatus,
  AuthLogResult,
  AuthLogAction,
  UserStatus,
  UserTier,
} from '@hansapp/admin-application';
import type {
  CachedSession,
  ProfileCacheState,
  SessionCacheState,
  UserAppSummary,
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
    description: '액션별 부가정보. **모양이 액션마다 다르다** — 정해진 필드가 없고, 없으면 빠진다.',
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
 * 이메일과 이메일 인증 여부는 여기 없다 — 왜 안 여는지는 UserAdminService 주석에
 * 적어 두었다.
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

  @ApiPropertyOptional({
    description: '등급. 앱 생성 한도를 정한다.',
    enum: UserTier,
  })
  @IsOptional()
  @IsEnum(UserTier)
  readonly tier?: UserTier;

  @ApiPropertyOptional({
    description:
      '표시·메일 언어. 지원하지 않는 값이면 400. ' +
      '빈 문자열을 보내면 지운다 — 그러면 요청의 Accept-Language 를 따른다.',
    enum: SUPPORTED_LANGS,
    example: 'ko',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  readonly language?: string;

  @ApiPropertyOptional({
    description: 'IANA 타임존 ID. 알아볼 수 없는 값이면 400. 빈 문자열을 보내면 지운다.',
    maxLength: 64,
    example: 'Asia/Seoul',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  readonly timeZone?: string;
}

/**
 * 캐시 한 칸의 상태. **내 정보 캐시와 세션 캐시가 같이 쓴다** — 글 캐시(PostCacheStateDto)와도
 * 같은 모양이라 콘솔이 하나의 패널로 본다.
 */
export class CacheStateDto {
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
 * 세션 하나의 인증 캐시.
 *
 * **값(value)은 싣지 않는다.** 담겨 있는 것이 만료 시각 하나뿐이라 펼쳐 봐야 얻을 것이
 * 없고, 목록 한 줄에 넣기에도 무겁다 — 여기서 알고 싶은 것은 "캐시에 올라가 있나" 다.
 */
export class SessionCacheDto {
  @ApiProperty({ description: '지금 캐시에 들어 있나' })
  readonly hit!: boolean;

  @ApiProperty({ nullable: true, description: '남은 시간(ms)' })
  readonly remainingMs!: number | null;

  constructor(state: SessionCacheState) {
    this.hit = state.hit;
    this.remainingMs = state.remainingMs;
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
  @ApiProperty({
    description:
      '세션 식별자(난수). 이 기기를 끊을 때 쓴다. **회원 안에서만 유일하다** — 회원번호와 짝으로만 의미가 있다.',
  })
  readonly sessionId!: number;

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

  @ApiProperty({
    description:
      '이 세션의 인증 캐시 상태. **가드가 요청마다 보는 자리라 실제 통과 여부를 정한다** — ' +
      '목록 자체는 DB 를 보고 그리므로 둘이 어긋날 수 있다.',
    type: () => SessionCacheDto,
  })
  readonly cache!: SessionCacheDto;

  constructor(session: UserSession, cache: SessionCacheState) {
    this.cache = new SessionCacheDto(cache);
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

  @ApiPropertyOptional({
    description: '표시·메일 언어. 정한 적이 없으면 null — 그때는 요청의 Accept-Language 를 따른다.',
    enum: SUPPORTED_LANGS,
  })
  readonly language!: string | null;

  @ApiPropertyOptional({
    description: 'IANA 타임존 ID. 정한 적이 없으면 null.',
    example: 'Asia/Seoul',
  })
  readonly timeZone!: string | null;

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
    this.language = user.language;
    this.timeZone = user.timeZone;
    this.hasPassword = user.hasPassword;
    this.oauths = user.oauths.map((o) => new UserOAuthDto(o));
    this.activeSessionCount = user.activeSessionCount;
    this.appCount = user.appCount;
  }
}

/**
 * DB 에는 없는데 캐시에만 남아 있는 세션.
 *
 * **잘못된 데이터다.** 기기를 끊을 때 캐시 삭제가 실패하면 생긴다 — 가드는 이 캐시를 보고
 * 통과시키므로, 끊은 기기가 캐시 만료까지 계속 통한다. 정리 배치가 주기적으로 치우지만
 * 그 전에 눈으로 확인하고 지울 수 있어야 한다.
 */
export class OrphanSessionCacheDto {
  @ApiProperty({ description: '세션 식별자(난수)' })
  readonly sessionId!: number;

  @ApiProperty({
    description: '캐시에 담긴 세션 만료 시각(ISO 8601). 이 시각까지 통과한다.',
  })
  readonly expiresAt!: string;

  constructor(entry: CachedSession) {
    this.sessionId = entry.sessionId;
    this.expiresAt = new Date(entry.expiresAt).toISOString();
  }
}

/**
 * 기기 목록 응답.
 *
 * **두 곳에서 따로 읽어 합친다.** 목록은 DB 가 정본이지만 요청을 실제로 통과시키는 것은
 * 캐시라, 둘이 어긋나는 쪽을 감추면 "끊었는데 왜 아직 되지" 를 영영 못 짚는다.
 */
export class UserSessionListDto {
  @ApiProperty({ description: 'DB 에 있는 세션. 캐시 상태를 함께 싣는다.', type: [UserSessionDto] })
  readonly sessions!: UserSessionDto[];

  @ApiProperty({
    description: 'DB 에는 없는데 캐시에만 남은 것. 비어 있는 것이 정상이다.',
    type: [OrphanSessionCacheDto],
  })
  readonly orphans!: OrphanSessionCacheDto[];

  constructor(sessions: UserSessionDto[], orphans: OrphanSessionCacheDto[]) {
    this.sessions = sessions;
    this.orphans = orphans;
  }
}

/**
 * 회원이 소유·참여하는 앱 한 줄.
 *
 * **앱 목록 한 줄과 다르다.** 소유자는 이미 아는 사람(그 회원)이라 빼고, 대신 그 회원이
 * 이 앱에서 무엇인지(역할)와 언제 합류했는지를 싣는다. 나머지는 앱 상세에서 본다.
 */
export class UserAppDto {
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

  @ApiProperty({
    description: '이 회원의 역할. OWNER(소유) / ADMIN(관리) / MEMBER(읽기)',
  })
  readonly role!: string;

  @ApiProperty({ description: '이 앱의 멤버가 된 시각(ISO 8601)' })
  readonly joinedAt!: string;

  @ApiProperty({ description: '앱 등록 시각(ISO 8601)' })
  readonly createdAt!: string;

  constructor(app: UserAppSummary) {
    this.id = app.id;
    this.name = app.name;
    this.status = app.status;
    this.reviewRequestedAt = app.reviewRequestedAt?.toISOString() ?? null;
    this.rejectionReason = app.rejectionReason;
    this.deletedAt = app.deletedAt?.toISOString() ?? null;
    this.role = app.role;
    this.joinedAt = app.joinedAt.toISOString();
    this.createdAt = app.createdAt.toISOString();
  }
}
