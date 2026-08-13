import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NmcBabyService } from '@hansapp/application';
import type { BabyHospitalListResponse } from '@krdata/nmc';

import { Auth } from '../../auth/auth.decorator';
import { AuthType } from '../../auth/auth-type.enum';
import { krDataSchemaRef } from '../../krdata-schemas';
import { MirrorListRequestDto } from '../dto/mirror-list.request.dto';

/**
 * 달빛어린이병원·소아전문센터 API.
 *
 * **응답 구조는 원본 API(getBabyListInfoInqire)와 동일하다.**
 * 평일 18~24시, 주말·공휴일 09~24시 진료라는 성격이 뚜렷해 일반 병원 목록과 따로 둔다.
 * 전국 153곳이며 전부 병원 목록(nmc_hospital)에도 존재한다.
 */
@ApiTags('nmc')
@Auth(AuthType.Jwt, AuthType.ApiKey)
@Controller('data-go-kr/nmc/baby-hospitals')
export class NmcBabyController {
  constructor(private readonly babyService: NmcBabyService) {}

  @Get()
  @ApiOperation({
    summary: '달빛어린이병원 목록 조회',
    description:
      '로컬 DB 에 미러링한 달빛어린이병원·소아전문센터. 응답 구조는 원본 API 와 동일하다.',
  })
  @ApiOkResponse({ schema: krDataSchemaRef('NmcBabyHospitalListResponse') })
  async list(@Query() request: MirrorListRequestDto): Promise<BabyHospitalListResponse> {
    return this.babyService.listBabyHospitals({
      page: request.page,
      size: request.size,
    });
  }
}
