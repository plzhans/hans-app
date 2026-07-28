import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HiraCodeService, type HiraCodeResponse } from '@hansapp/application';

import { Auth } from '../../auth/auth.decorator';
import { AuthType } from '../../auth/auth-type.enum';
import { krDataSchemaRef } from '../../krdata-schemas';
import { HiraCodeListRequestDto } from '../dto/hira-code-list.request.dto';

/**
 * 응답 스키마. 봉투 구조는 6종이 같고 item 필드명만 다르다.
 * tp 로 갈라지므로 oneOf 로 열거한다.
 */
const RESPONSE_SCHEMA = {
  oneOf: [
    krDataSchemaRef('HiraAddressCodeResponse'),
    krDataSchemaRef('HiraInstitutionClassCodeResponse'),
    krDataSchemaRef('HiraSubjectCodeResponse'),
    krDataSchemaRef('HiraEquipmentCodeResponse'),
    krDataSchemaRef('HiraSearchCodeResponse'),
  ],
};

/**
 * 건강보험심사평가원(HIRA) 코드 API.
 *
 * **원본 API 는 코드 종류마다 엔드포인트가 따로다(codeInfoService 6종).**
 * 여기서는 엔드포인트를 하나로 두고 `tp` 파라미터로 종류를 고른다.
 * 응답 봉투와 item 필드명은 종류별 원본 API 와 동일하다.
 * (tp=class → clCd/clCdNm, tp=subject → dgsbjtCd/dgsbjtCdNm/dgsbjtCdCmmt)
 *
 * 적재는 hansapp-cli 의 `hira code sync` 가 담당한다. 이 서버는 DB 만 읽는다.
 */
@ApiTags('hira')
@Auth(AuthType.Jwt, AuthType.ApiKey)
@Controller('data-go-kr/hira/codes')
export class HiraCodeController {
  constructor(private readonly hiraCodeService: HiraCodeService) {}

  @Get()
  @ApiOperation({
    summary: '코드 목록 조회',
    description:
      '로컬 DB 에 미러링한 HIRA 코드. tp 로 종류를 고른다. 응답 item 의 필드명은 종류별 원본 API 와 같다.',
  })
  @ApiOkResponse({ schema: RESPONSE_SCHEMA })
  async list(
    @Query() request: HiraCodeListRequestDto,
  ): Promise<HiraCodeResponse> {
    return this.hiraCodeService.listCodes({
      tp: request.tp,
      page: request.page,
      size: request.size,
    });
  }
}
