import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { SUPPORTED_LANGS } from '@hansapp/common';

/**
 * 내 정보 변경 요청. **보낸 항목만 바뀐다** — 이름만 고치려고 언어까지 실어 보낼 필요가 없다.
 *
 * 국가는 여기 없다. 가입 시점에 한 번 적어 두는 집계용 값이라 바꿀 경로를 두지 않는다.
 */
export class UpdateProfileRequestDto {
  @ApiPropertyOptional({
    description: '표시 이름(빈 문자열이면 삭제)',
    example: '홍길동',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  readonly name?: string;

  @ApiPropertyOptional({
    description: '표시·메일 언어',
    enum: SUPPORTED_LANGS,
    example: 'ko',
  })
  @IsOptional()
  @IsIn(SUPPORTED_LANGS)
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

/**
 * 비밀번호 변경·설정 요청. **하나의 요청으로 둘 다 처리한다.**
 *
 * `currentPassword` 를 선택 항목으로 둔 것은 소셜로만 가입해 비밀번호가 없는 계정 때문이다 —
 * 그런 계정에는 물을 현재 비밀번호가 없다. **다만 무엇을 확인할지는 서버가 정한다**:
 * 계정에 비밀번호가 있으면 이 값이 반드시 있어야 하고 틀리면 거절한다. 클라이언트가 이 항목을
 * 빼고 보내는 것만으로 확인을 건너뛸 수 있으면, 남의 세션을 주운 사람이 비밀번호를 갈아 끼운다.
 */
export class UpdatePasswordRequestDto {
  @ApiPropertyOptional({
    description:
      '현재 비밀번호. 비밀번호가 설정된 계정은 **필수**다(없거나 틀리면 401). ' +
      '소셜로만 가입해 비밀번호가 없는 계정은 보내지 않는다.',
  })
  @IsOptional()
  @IsString()
  // 대조만 하는 값이라 최소 길이는 안 건다(옛 규칙으로 만든 비밀번호가 있을 수 있다).
  @MaxLength(72)
  readonly currentPassword?: string;

  @ApiProperty({ description: '새 비밀번호(8자 이상)' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  readonly newPassword!: string;
}

/** 내 정보 응답 */
export class MeResponseDto {
  @ApiProperty({ description: '회원번호' })
  readonly id!: number;

  @ApiProperty({ description: '이메일' })
  readonly email!: string;

  @ApiProperty({ description: '이메일 인증 여부' })
  readonly emailVerified!: boolean;

  @ApiPropertyOptional({ description: '표시 이름' })
  readonly name?: string | null;

  @ApiProperty({ description: '권한', example: 'USER' })
  readonly role!: string;

  @ApiProperty({ description: '최초 가입 수단', example: 'EMAIL' })
  readonly joinType!: string;

  @ApiPropertyOptional({
    description:
      '표시·메일 언어. 고른 적이 없으면 null 이고, 그때는 요청의 Accept-Language 를 따른다.',
    enum: SUPPORTED_LANGS,
    example: 'ko',
  })
  readonly language?: string | null;

  @ApiPropertyOptional({
    description: 'IANA 타임존 ID. 고른 적이 없으면 null 이다.',
    type: String,
    example: 'Asia/Seoul',
  })
  readonly timeZone?: string | null;

  @ApiProperty({
    description: '가입 일시',
    example: '2026-08-06T02:10:00.000Z',
  })
  readonly createdAt!: string;

  @ApiProperty({
    description:
      '비밀번호가 설정돼 있는가. 소셜로만 가입한 계정은 false 라 화면이 "변경" 대신 "설정" 을 띄운다.',
  })
  readonly hasPassword!: boolean;

  @ApiProperty({
    description: '연동된 소셜 제공자 목록',
    example: ['GOOGLE', 'KAKAO'],
    type: [String],
  })
  readonly linkedProviders!: string[];
}

/**
 * 로그인한 기기 한 대.
 *
 * **토큰 해시는 내보내지 않는다.** 세션 식별자만 있으면 로그아웃시킬 수 있고, 해시는 화면이
 * 쓸 일이 없다 — 응답에 실을 이유가 없는 값은 싣지 않는다.
 */
export class SessionDto {
  @ApiProperty({
    description: '세션 식별자(난수). 개별 로그아웃에 쓴다. **본인 계정 안에서만 유일하다.**',
  })
  readonly sessionId!: number;

  @ApiPropertyOptional({ description: '접속 기기의 브라우저·운영체제 정보' })
  readonly userAgent?: string | null;

  @ApiPropertyOptional({ description: '접속 IP' })
  readonly ip?: string | null;

  @ApiProperty({ description: '로그인 시각' })
  readonly createdAt!: string;

  @ApiProperty({ description: '마지막 갱신 시각(최근 활동)' })
  readonly updatedAt!: string;

  @ApiProperty({ description: '지금 보고 있는 이 기기인가' })
  readonly current!: boolean;
}

/**
 * 동의 기록 한 줄.
 *
 * **이용자가 볼 수 있어야 기록이 의미를 가진다.** 개인정보처리방침 제10조가 약속한 "열람" 의
 * 실체가 이것이다 — 무엇에 언제 어느 판으로 동의했는지를 본인이 확인할 수 있어야 한다.
 * IP·기기는 돌려주지 않는다. 본인 것이라도 화면에 뿌릴 이유가 없고, 유출 시 손해만 는다.
 */
export class ConsentRecordDto {
  @ApiProperty({ description: '동의 항목', example: 'TERMS' })
  readonly type!: string;

  @ApiProperty({ description: '동의한 문서의 판', example: '2026-08-06' })
  readonly version!: string;

  @ApiProperty({
    description: '동의 일시',
    example: '2026-08-06T02:10:00.000Z',
  })
  readonly agreedAt!: string;
}

/** 소셜 연동 시작 토큰 응답 */
export class LinkTokenResponseDto {
  @ApiProperty({
    description:
      '연동 시작 토큰. `GET /auth/{provider}?link_token=<토큰>` 으로 이동하면 현재 계정에 연동된다.',
  })
  readonly linkToken!: string;
}
