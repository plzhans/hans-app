import { ApiProperty } from '@nestjs/swagger';

/** 어느 소셜을 쓸 수 있는가. 로그인 화면이 버튼을 그릴지 정하는 데 쓴다. */
export class AdminSocialProviderResponseDto {
  @ApiProperty({
    description: '구글 로그인 사용 가능 여부. 설정(admin.google.*)이 채워져 있으면 true.',
  })
  readonly google!: boolean;
}

/** 연동 하나. */
export class AdminSocialLinkDto {
  @ApiProperty({ description: 'provider', example: 'GOOGLE' })
  readonly provider!: string;

  @ApiProperty({
    description: '연동한 소셜 계정의 이메일. 표시용이라 로그인 대조에는 쓰지 않는다.',
    nullable: true,
  })
  readonly email!: string | null;

  @ApiProperty({ description: '연동 시각' })
  readonly linkedAt!: Date;
}

/**
 * 연동 시작 주소.
 *
 * **주소를 서버가 만들어 준다.** 이 요청은 access token 으로 인증되지만 연동은 브라우저를
 * 구글로 보내는 이동이라 헤더를 실을 수 없다 — 대신 짧은 티켓을 박은 주소를 내주고,
 * 화면은 그리로 이동하기만 한다.
 */
export class AdminSocialLinkStartResponseDto {
  @ApiProperty({ description: '이 주소로 이동하면 구글 연동이 시작된다.' })
  readonly startUrl!: string;
}
