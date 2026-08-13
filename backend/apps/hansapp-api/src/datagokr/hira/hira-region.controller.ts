import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { HiraRegionService, HiraSubjectService } from '@hansapp/application';

import { Auth } from '../../auth/auth.decorator';
import { AuthType } from '../../auth/auth-type.enum';
import { krDataSchemaRef } from '../../krdata-schemas';
import { MirrorListRequestDto } from '../dto/mirror-list.request.dto';
import { HiraRegionResponseDto } from '../dto/krdata-envelope.dto';

/**
 * 건강보험심사평가원(HIRA) 지역·진료과목 API.
 *
 * - 지역: 원본은 시도 코드 목록만 주고 **시군구 코드 목록 API 가 없다**. 병원 데이터에서 집계했다.
 * - 진료과목: 응답 item 은 원본 API(getSubjectInfo)와 같은 필드명이다. 매핑은 병원 목록의
 *   dgsbjtCd 필터를 과목별로 뒤집어 조회해(~94콜) 만들었다. 병원별로 받으면 79,739콜이다.
 *   원본 단건 API 가 추가로 주는 과목별 전문의수(dgsbjtPrSdrCnt)는 아직 받지 않아 비어 있다.
 */
@ApiTags('hira')
@Auth(AuthType.Jwt, AuthType.ApiKey)
@Controller('data-go-kr/hira')
export class HiraRegionController {
  constructor(
    private readonly regionService: HiraRegionService,
    private readonly subjectService: HiraSubjectService,
  ) {}

  @Get('regions')
  @ApiOperation({
    summary: '지역 목록 조회',
    description:
      '병원 데이터에서 집계한 시도·시군구 목록(코드 포함). 병원이 1건 이상 있는 지역만 나온다.',
  })
  @ApiOkResponse({ type: HiraRegionResponseDto })
  async listRegions(@Query() request: MirrorListRequestDto) {
    return this.regionService.listRegions({
      page: request.page,
      size: request.size,
    });
  }

  @Get('hospitals/:ykiho/subjects')
  @ApiOperation({
    summary: '병원 진료과목 조회',
    description: '해당 병원이 진료하는 과목 목록. 응답 구조는 원본 API(진료과목정보)와 동일하다.',
  })
  @ApiParam({ name: 'ykiho', description: '암호화된 요양기호' })
  @ApiOkResponse({ schema: krDataSchemaRef('HiraSubjectInfoResponse') })
  async listSubjects(@Param('ykiho') ykiho: string) {
    return this.subjectService.listByHospital(ykiho);
  }
}
