import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { AdminLogAction, AdminLogResult } from '@hansapp/admin-application';
import type { AdminActionLogEntry, AdminMailOutcome } from '@hansapp/admin-application';
import { AdminRole, AdminStatus } from '@hansapp/admin-application/auth';
import type {
  AdminAccountDetail,
  AdminAccountSummary,
  AdminOAuthSummary,
  AdminSessionCacheState,
  AdminSessionSummary,
  CachedAdminSession,
} from '@hansapp/admin-application/auth';
import { SUPPORTED_LANGS } from '@hansapp/common';

/**
 * 기록 조회 조건.
 *
 * **기본은 전체 기간·전체 종류다.** 이 화면을 여는 이유가 대개 "무슨 일이 있었나" 라서,
 * 처음부터 좁혀 놓으면 찾으려던 것이 화면 밖에 있다.
 */
export class AdminActionLogQueryDto {
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
      '볼 종류. 쉼표로 여러 개(`LOGIN,ADMIN_DELETE`) 또는 같은 이름을 반복해 보낸다. 없으면 전부.',
    enum: AdminLogAction,
    isArray: true,
  })
  @IsOptional()
  // 회원 기록(UserAuthLogQueryDto)과 같은 규칙이다 — 문자열·배열·쉼표 세 모양을 배열로 맞춘다.
  @Transform(({ value }) => {
    // **없을 때 손대지 않는다.** 여기서 배열을 만들면 @IsOptional 이 건너뛸 기회를 잃는다.
    if (value == null) return undefined;
    const parsed = (Array.isArray(value) ? value : [value])
      .flatMap((item: unknown) => String(item).split(','))
      .map((item) => item.trim())
      .filter(Boolean);
    return parsed.length ? parsed : undefined;
  })
  @IsEnum(AdminLogAction, { each: true })
  readonly actions?: AdminLogAction[];
}

/** 기록 한 줄. **session_id 는 내보내지 않는다** — 화면이 쓸 일이 없다. */
export class AdminActionLogDto {
  @ApiProperty({
    description: '로그 식별자. BigInt 라 문자열로 준다.',
    example: '184',
  })
  readonly id!: string;

  @ApiProperty({ description: '조치 종류', enum: AdminLogAction })
  readonly action!: AdminLogAction;

  @ApiProperty({ description: '결과', enum: AdminLogResult })
  readonly result!: AdminLogResult;

  @ApiPropertyOptional({
    description: '이 일을 한 관리자 번호. 없는 계정으로의 로그인 시도면 없다.',
  })
  readonly adminId!: number | null;

  @ApiPropertyOptional({
    description:
      '그때의 이메일. **계정이 지워진 뒤에는 이 값만 남는다** — 로그 DB 는 계정 표와 조인할 수 없다.',
  })
  readonly email!: string | null;

  @ApiPropertyOptional({
    description: '조치를 당한 관리자 번호. 계정 관리에서만 있다.',
  })
  readonly targetAdminId!: number | null;

  @ApiPropertyOptional({ description: '실패 사유. 성공이면 없다.' })
  readonly failReason!: string | null;

  @ApiPropertyOptional({ description: '접속 IP' })
  readonly ip!: string | null;

  @ApiPropertyOptional({ description: '접속 기기 정보' })
  readonly userAgent!: string | null;

  @ApiPropertyOptional({
    description: '조치별 부가정보. **모양이 종류마다 다르다** — 정해진 필드가 없고, 없으면 빠진다.',
    type: 'object',
    additionalProperties: true,
  })
  readonly detail!: unknown;

  @ApiProperty({ description: '발생 시각(ISO 8601)' })
  readonly createdAt!: string;

  constructor(entry: AdminActionLogEntry) {
    this.id = entry.id;
    this.action = entry.action;
    this.result = entry.result;
    this.adminId = entry.adminId;
    this.email = entry.email;
    this.targetAdminId = entry.targetAdminId;
    this.failReason = entry.failReason;
    this.ip = entry.ip;
    this.userAgent = entry.userAgent;
    this.detail = entry.detail;
    this.createdAt = entry.createdAt.toISOString();
  }
}

export class AdminAccountSummaryDto {
  @ApiProperty({ description: '관리자 번호' }) readonly id!: number;

  @ApiProperty({ description: '로그인 식별자' }) readonly email!: string;

  @ApiPropertyOptional({ description: '표시 이름' })
  readonly name!: string | null;

  @ApiProperty({
    description:
      '등급. **자기보다 높은 등급의 계정은 만들지도 고치지도 못한다**(삭제·비밀번호 초기화도 같다).',
    enum: AdminRole,
  })
  readonly role!: AdminRole;

  @ApiProperty({
    description: '계정 상태. DISABLED 는 로그인이 막힌다.',
    enum: AdminStatus,
  })
  readonly status!: AdminStatus;

  @ApiProperty({
    description:
      '다음 로그인에서 비밀번호를 바꿔야 하는지. 남이 정해 준 비밀번호를 아직 안 바꾼 계정이다.',
  })
  readonly mustChangePassword!: boolean;

  @ApiProperty({
    description: '관리 화면·메일 언어',
    enum: SUPPORTED_LANGS,
    example: 'ko',
  })
  readonly language!: string;

  @ApiProperty({
    description: '화면의 시각 표기에 쓰는 IANA 타임존 ID',
    example: 'Asia/Seoul',
  })
  readonly timeZone!: string;

  @ApiPropertyOptional({
    description: '마지막 로그인 시각(ISO 8601). 한 번도 없으면 null',
  })
  readonly lastLoginAt!: string | null;

  @ApiProperty({ description: '생성 시각(ISO 8601)' })
  readonly createdAt!: string;

  @ApiPropertyOptional({
    description:
      '지운 시각(ISO 8601). **null 이면 살아 있다.**\n\n' +
      '지운 계정은 행으로 남지만 로그인할 수 없고 고칠 수도 없다 — 계정 행이 조치 기록이 ' +
      '가리키는 대상이라 지우지 않는다.',
  })
  readonly deletedAt!: string | null;

  constructor(admin: AdminAccountSummary) {
    this.id = admin.id;
    this.email = admin.email;
    this.name = admin.name;
    this.role = admin.role;
    this.status = admin.status;
    this.mustChangePassword = admin.mustChangePassword;
    this.language = admin.language;
    this.timeZone = admin.timeZone;
    this.lastLoginAt = admin.lastLoginAt?.toISOString() ?? null;
    this.createdAt = admin.createdAt.toISOString();
    this.deletedAt = admin.deletedAt?.toISOString() ?? null;
  }
}

/**
 * 붙어 있는 소셜 하나.
 *
 * **연동되지 않은 provider 는 여기 없다.** 무엇을 붙일 수 있는지는 서버 설정이 정하고
 * 화면이 알고 있으므로, 이 목록은 "실제로 붙어 있는 것" 만 담는다(회원 상세와 같은 규칙).
 */
export class AdminOAuthDto {
  @ApiProperty({ description: '소셜 provider', example: 'GOOGLE' })
  readonly provider!: string;

  @ApiPropertyOptional({
    description: '연동 시점에 provider 가 준 이메일. 관리자 계정의 이메일과 다를 수 있다.',
  })
  readonly email!: string | null;

  @ApiProperty({ description: '연동 시각(ISO 8601)' })
  readonly connectedAt!: string;

  constructor(oauth: AdminOAuthSummary) {
    this.provider = oauth.provider;
    this.email = oauth.email;
    this.connectedAt = oauth.connectedAt.toISOString();
  }
}

/** 목록 조회 조건. */
export class AdminListQueryDto {
  @ApiPropertyOptional({
    description:
      '지운 계정만 본다. 기본은 **살아 있는 계정만**이다.\n\n' +
      '두 목록을 섞지 않는 이유는, 이 목록을 여는 질문이 "지금 누가 들어올 수 있나" 라서다 — ' +
      '들어올 수 없는 계정이 같은 표에 있으면 그 답이 흐려진다.',
    default: false,
  })
  @IsOptional()
  // 쿼리스트링은 문자열로 온다. `?deleted` 처럼 값 없이 오는 것도 켠 것으로 본다.
  @Transform(({ value }) => value === true || value === 'true' || value === '')
  @IsBoolean()
  readonly deleted: boolean = false;
}

export class AdminAccountDetailDto extends AdminAccountSummaryDto {
  @ApiProperty({ description: '최종 수정 시각(ISO 8601)' })
  readonly updatedAt!: string;

  @ApiProperty({ description: '살아 있는 로그인 세션 수' })
  readonly activeSessionCount!: number;

  @ApiProperty({
    description: '붙어 있는 소셜 연동. **비어 있는 것이 정상이다.**',
    type: [AdminOAuthDto],
  })
  readonly oauths!: AdminOAuthDto[];

  constructor(admin: AdminAccountDetail) {
    super(admin);
    this.updatedAt = admin.updatedAt.toISOString();
    this.activeSessionCount = admin.activeSessionCount;
    this.oauths = admin.oauths.map((oauth) => new AdminOAuthDto(oauth));
  }
}

/**
 * 세션 하나의 인증 캐시. **목록 한 줄에 실리는 요약이다.**
 *
 * 담긴 값까지 줄마다 싣지 않는다 — 만료 시각 하나뿐이라 펼쳐 봐야 얻을 것이 없고,
 * 값을 볼 자리는 캐시 화면(`GET :id/cache`)이 따로 있다.
 */
export class AdminSessionCacheDto {
  @ApiProperty({ description: '지금 캐시에 들어 있나' })
  readonly hit!: boolean;

  @ApiProperty({ nullable: true, description: '남은 시간(ms)' })
  readonly remainingMs!: number | null;

  constructor(state: AdminSessionCacheState) {
    this.hit = state.hit;
    this.remainingMs = state.remainingMs;
  }
}

/**
 * 로그인해 둔 기기 한 줄.
 *
 * **세션 식별자를 담는다.** 기기 한 대를 끊으려면 대상을 가리키는 값이 있어야 한다.
 * 이 값만으로는 로그인할 수 없다 — refresh token 은 `sid + secret` 인데 secret 은
 * 해시로만 저장되고 어디에도 나가지 않는다.
 */
export class AdminSessionDto {
  @ApiProperty({
    description:
      '세션 식별자(난수). 이 기기를 끊을 때 쓴다. **계정 안에서만 유일하다** — ' +
      '관리자번호와 짝으로만 의미가 있고, 이 값만으로는 로그인할 수 없다.',
  })
  readonly sessionId!: number;

  @ApiProperty({
    description:
      '지금 이 요청을 보낸 세션인가. **본인 계정을 볼 때만 true 가 될 수 있다** — ' +
      '이 줄을 끊으면 그 자리에서 로그인 화면으로 나간다.',
  })
  readonly current!: boolean;

  @ApiPropertyOptional({ description: '접속 기기의 브라우저·운영체제 정보' })
  readonly userAgent!: string | null;

  @ApiPropertyOptional({ description: '접속 IP' })
  readonly ip!: string | null;

  @ApiProperty({ description: '이 기기에서 로그인한 시각(ISO 8601)' })
  readonly createdAt!: string;

  @ApiProperty({ description: '마지막 갱신 시각(ISO 8601). 사실상 최근 활동 시각이다.' })
  readonly updatedAt!: string;

  @ApiProperty({ description: '만료 시각(ISO 8601)' })
  readonly expiresAt!: string;

  @ApiProperty({
    description:
      '이 세션의 인증 캐시 상태. **가드가 요청마다 보는 자리라 실제 통과 여부를 정한다** — ' +
      '목록 자체는 DB 를 보고 그리므로 둘이 어긋날 수 있다.',
    type: () => AdminSessionCacheDto,
  })
  readonly cache!: AdminSessionCacheDto;

  constructor(session: AdminSessionSummary, cache: AdminSessionCacheState, current: boolean) {
    this.sessionId = session.sessionId;
    this.current = current;
    this.userAgent = session.userAgent;
    this.ip = session.ip;
    this.createdAt = session.createdAt.toISOString();
    this.updatedAt = session.updatedAt.toISOString();
    this.expiresAt = session.expiresAt.toISOString();
    this.cache = new AdminSessionCacheDto(cache);
  }
}

/**
 * DB 에는 없는데 캐시에만 남은 세션. **잘못된 데이터다.**
 *
 * 기기를 끊을 때 캐시 삭제가 실패하면 생긴다 — 가드는 이 캐시를 보고 통과시키므로,
 * 끊은 기기가 캐시 만료까지 계속 통한다. 비어 있는 것이 정상이다.
 */
export class OrphanAdminSessionCacheDto {
  @ApiProperty({ description: '세션 식별자(난수)' })
  readonly sessionId!: number;

  @ApiProperty({
    description: '캐시에 담긴 세션 만료 시각(ISO 8601). 이 시각까지 통과한다.',
  })
  readonly expiresAt!: string;

  constructor(entry: CachedAdminSession) {
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
export class AdminSessionListDto {
  @ApiProperty({
    description: 'DB 에 있는 세션. 캐시 상태를 함께 싣는다.',
    type: [AdminSessionDto],
  })
  readonly sessions!: AdminSessionDto[];

  @ApiProperty({
    description: 'DB 에는 없는데 캐시에만 남은 것. 비어 있는 것이 정상이다.',
    type: [OrphanAdminSessionCacheDto],
  })
  readonly orphans!: OrphanAdminSessionCacheDto[];

  constructor(sessions: AdminSessionDto[], orphans: OrphanAdminSessionCacheDto[]) {
    this.sessions = sessions;
    this.orphans = orphans;
  }
}

/**
 * 캐시 한 칸의 상태. **담긴 값까지 싣는다.**
 *
 * 회원 쪽 CacheStateDto 와 같은 모양이라 콘솔이 같은 패널로 본다 — 묻는 것이 같아서다:
 * 무엇이 들어 있나, 언제 빠지나.
 */
export class AdminCacheStateDto {
  @ApiProperty({ description: '캐시 키. 환경 접두어는 빠져 있다.' })
  readonly key!: string;

  @ApiProperty({ description: '지금 캐시에 들어 있나' })
  readonly hit!: boolean;

  @ApiProperty({ nullable: true, description: '이 칸이 캐시에서 빠지는 시각' })
  readonly expiresAt!: string | null;

  @ApiProperty({ nullable: true, description: '남은 시간(ms)' })
  readonly remainingMs!: number | null;

  @ApiProperty({
    nullable: true,
    description:
      '담긴 값 그대로. 바깥의 `v` 는 캐시 미스와 "조회했는데 없음" 을 가르려고 서버가 씌운 껍데기다.',
  })
  readonly value!: unknown;

  @ApiProperty({
    description:
      'Redis 처럼 프로세스 밖에서 공유되는 캐시인가. false 면 이 프로세스의 메모리라, ' +
      '관리자 API 가 여러 대면 나머지 캐시는 여기서 보이지도 지워지지도 않는다.',
  })
  readonly shared!: boolean;

  constructor(state: AdminSessionCacheState) {
    this.key = state.key;
    this.hit = state.hit;
    this.expiresAt = state.expiresAt?.toISOString() ?? null;
    this.remainingMs = state.remainingMs;
    this.value = state.value;
    this.shared = state.shared;
  }
}

export class AdminAccountCreateRequestDto {
  @ApiProperty({ description: '로그인 식별자', example: 'admin@example.com' })
  @IsEmail()
  @MaxLength(320)
  readonly email!: string;

  @ApiPropertyOptional({ description: '표시 이름', example: '홍길동' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  readonly name?: string;

  @ApiProperty({
    description:
      '등급. **자기보다 높은 등급은 만들 수 없다**(403). 기본값이 없다 — 빠뜨린 요청이 ' +
      '최고 등급을 만들어 버리는 것은 조용한 사고라, 반드시 골라 보낸다.',
    enum: AdminRole,
  })
  @IsEnum(AdminRole)
  readonly role!: AdminRole;

  @ApiProperty({
    description: '초기 비밀번호. **본인이 첫 로그인에서 다시 바꿔야** 다른 API 가 열린다.',
    minLength: 10,
  })
  @IsString()
  // 본인이 바꾸는 경로(AdminChangePasswordRequestDto)와 같은 기준이다.
  // 여기만 느슨하면 짧은 비밀번호가 계정 생성으로 들어온다.
  @MinLength(10)
  @MaxLength(72)
  readonly password!: string;

  @ApiPropertyOptional({
    description:
      '만든 계정에 이메일·임시 비밀번호를 메일로 알린다. 기본은 보내지 않는다.\n\n' +
      '**발송 실패가 계정 생성을 되돌리지는 않는다** — 실제로 나갔는지는 응답의 `emailSent` 로 본다.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  readonly sendEmail?: boolean;
}

/**
 * 계정 수정 요청. **보낸 항목만 바뀐다.**
 *
 * 언어·시간대는 여기 없다 — 본인 화면(`PATCH /auth/me`)의 몫이다.
 * 비밀번호도 없다 — 초기화는 별도 경로(`POST /api/admins/:id/password`)다.
 */
export class AdminAccountUpdateRequestDto {
  @ApiPropertyOptional({
    description: '로그인 식별자. **바꾸면 옛 주소로는 로그인할 수 없다.** 이미 쓰는 주소면 409.',
    example: 'admin@example.com',
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  readonly email?: string;

  @ApiPropertyOptional({
    description:
      '등급. **자기보다 높은 등급으로는 못 바꾸고, 지금 등급이 자기보다 높은 계정은 아예 못 고친다**(403).\n\n' +
      '마지막 시스템 관리자의 등급은 내릴 수 없다 — 그 등급을 되돌릴 사람이 없어진다.',
    enum: AdminRole,
  })
  @IsOptional()
  @IsEnum(AdminRole)
  readonly role?: AdminRole;

  @ApiPropertyOptional({
    description: '표시 이름. 빈 값으로 보내면 지운다.',
    example: '홍길동',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  readonly name?: string;

  @ApiPropertyOptional({
    description:
      '관리 화면·메일 언어. 본인 화면(`PATCH /auth/me`)에도 같은 값이 있다 — ' +
      '본인이 콘솔에 못 들어오는 동안에도 손볼 수 있게 이 통로를 함께 연다.',
    enum: SUPPORTED_LANGS,
    example: 'ko',
  })
  @IsOptional()
  @IsIn(SUPPORTED_LANGS)
  readonly language?: string;

  @ApiPropertyOptional({
    description: '화면의 시각 표기에 쓰는 IANA 타임존 ID. 알아볼 수 없는 값이면 400.',
    example: 'Asia/Seoul',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  readonly timeZone?: string;
}

/**
 * 비밀번호 초기화 요청.
 *
 * **현재 비밀번호를 묻지 않는다** — 본인이 값을 잃어버렸을 때 다른 관리자가 부르는 경로다.
 */
export class AdminPasswordResetRequestDto {
  @ApiProperty({
    description: '새 비밀번호. 본인이 첫 로그인에서 다시 바꿔야 한다.',
    minLength: 10,
  })
  @IsString()
  @MinLength(10)
  @MaxLength(72)
  readonly password!: string;

  @ApiPropertyOptional({
    description:
      '새 비밀번호를 본인에게 메일로 알린다. 기본은 보내지 않는다.\n\n' +
      '**발송 실패가 초기화를 되돌리지는 않는다** — 실제로 나갔는지는 응답의 `emailSent` 로 본다.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  readonly sendEmail?: boolean;

  @ApiPropertyOptional({
    description:
      '이 계정의 살아 있는 세션을 함께 끊는다. **기본은 끊는다.**\n\n' +
      '값이 새어 나가 다시 내주는 것이라면 열려 있던 세션을 남기는 순간 비밀번호를 바꾼 ' +
      '의미가 없다. 반대로 본인이 값을 잊어버린 것뿐이라면, 지금 콘솔에서 일하고 있는 ' +
      '사람을 이유 없이 밖으로 내보내게 된다 — 그때 `false` 로 남긴다.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  readonly revokeSessions?: boolean;

  @ApiPropertyOptional({
    description:
      '첫 로그인에서 비밀번호를 다시 바꾸게 만든다. **기본은 강제한다.**\n\n' +
      '남이 정해 준 값이 그대로 남으면 그 값을 아는 사람이 둘이 된다. ' +
      '`false` 는 본인과 함께 앉아 값을 정한 경우다.\n\n' +
      '**강제 상태에서는 다른 API 가 403 이다** — 다만 이 플래그는 access token 클레임이라, ' +
      '세션을 남겨 두면 그 토큰이 만료될 때까지(기본 1시간) 늦게 걸린다. ' +
      '곧바로 밀어내려면 `revokeSessions` 를 함께 켠다.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  readonly mustChangePassword?: boolean;
}

/** 메일이 나갔는지만 알려 준다. 계정 값은 바뀐 것이 없다(해시는 내보내지 않는다). */
export class AdminPasswordResetResponseDto {
  @ApiProperty({
    description: '안내 메일이 실제로 나갔는지. `sendEmail` 을 안 보냈으면 항상 false 다.',
  })
  readonly emailSent!: boolean;

  @ApiPropertyOptional({
    description: '메일을 보내려 했는데 못 보낸 이유. 성공했으면 없다.',
    enum: ['MAIL_DISABLED', 'SEND_FAILED'],
  })
  readonly emailFailReason!: string | null;

  constructor(mail?: AdminMailOutcome) {
    this.emailSent = mail === 'SENT';
    this.emailFailReason = mail && mail !== 'SENT' ? mail : null;
  }
}

export class AdminAccountCreateResponseDto {
  @ApiProperty({ description: '만들어진 계정', type: AdminAccountSummaryDto })
  readonly account!: AdminAccountSummaryDto;

  @ApiProperty({
    description: '안내 메일이 실제로 나갔는지. `sendEmail` 을 안 보냈으면 항상 false 다.',
  })
  readonly emailSent!: boolean;

  @ApiPropertyOptional({
    description:
      '메일을 보내려 했는데 못 보낸 이유. 보내달라고 하지 않았거나 성공했으면 없다.\n\n' +
      '- `MAIL_DISABLED`: 메일 발송이 꺼져 있거나 SMTP 가 설정되지 않았다\n' +
      '- `SEND_FAILED`: SMTP 가 거절했다(주소·서버를 의심할 자리다)',
    enum: ['MAIL_DISABLED', 'SEND_FAILED'],
  })
  readonly emailFailReason!: string | null;

  constructor(account: AdminAccountSummary, mail?: AdminMailOutcome) {
    this.account = new AdminAccountSummaryDto(account);
    this.emailSent = mail === 'SENT';
    this.emailFailReason = mail && mail !== 'SENT' ? mail : null;
  }
}
