import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
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
import type {
  AdminActionLogEntry,
  AdminMailOutcome,
} from '@hansapp/admin-application';
import { AdminRole, AdminStatus } from '@hansapp/admin-application/auth';
import type {
  AdminAccountDetail,
  AdminAccountSummary,
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
    description:
      '조치별 부가정보. **모양이 종류마다 다르다** — 정해진 필드가 없고, 없으면 빠진다.',
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
  }
}

export class AdminAccountDetailDto extends AdminAccountSummaryDto {
  @ApiProperty({ description: '최종 수정 시각(ISO 8601)' })
  readonly updatedAt!: string;

  @ApiProperty({ description: '살아 있는 로그인 세션 수' })
  readonly activeSessionCount!: number;

  constructor(admin: AdminAccountDetail) {
    super(admin);
    this.updatedAt = admin.updatedAt.toISOString();
    this.activeSessionCount = admin.activeSessionCount;
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
    description:
      '초기 비밀번호. **본인이 첫 로그인에서 다시 바꿔야** 다른 API 가 열린다.',
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
    description:
      '로그인 식별자. **바꾸면 옛 주소로는 로그인할 수 없다.** 이미 쓰는 주소면 409.',
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
}

/** 메일이 나갔는지만 알려 준다. 계정 값은 바뀐 것이 없다(해시는 내보내지 않는다). */
export class AdminPasswordResetResponseDto {
  @ApiProperty({
    description:
      '안내 메일이 실제로 나갔는지. `sendEmail` 을 안 보냈으면 항상 false 다.',
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
    description:
      '안내 메일이 실제로 나갔는지. `sendEmail` 을 안 보냈으면 항상 false 다.',
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
