import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { HIRA_CODE_TYPES, type HiraCodeType } from '@hansapp/application';

import { MirrorListRequestDto } from './mirror-list.request.dto';

/**
 * HIRA 코드 목록 조회 요청.
 *
 * 원본 API 는 코드 종류마다 엔드포인트가 따로다(codeInfoService 6종). 우리는 엔드포인트를
 * 하나로 두고 tp 로 고른다. 응답 item 의 필드명은 종류별 원본 그대로다.
 */
export class HiraCodeListRequestDto extends MirrorListRequestDto {
  @ApiProperty({
    description:
      '코드 종류. addr=주소, class=의료기관종별, subject=진료과목, equipment=장비, specialty=전문병원, special=특수진료',
    enum: HIRA_CODE_TYPES,
  })
  @IsIn(HIRA_CODE_TYPES)
  readonly tp!: HiraCodeType;
}
