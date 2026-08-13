import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { NmcHospitalService } from '@hansapp/application';
import type { HospitalFullDownResponse } from '@krdata/nmc';

import { Auth } from '../../auth/auth.decorator';
import { AuthType } from '../../auth/auth-type.enum';
import { DETAIL_CACHE_CONTROL } from '../../common/cache-control';
import { krDataSchemaRef } from '../../krdata-schemas';
import { MirrorListRequestDto } from '../dto/mirror-list.request.dto';

/** 병합된 SDK 스펙의 응답 스키마. 필드 설명이 거기 다 들어있다. */
const RESPONSE_SCHEMA = 'NmcHospitalFullDownResponse';

/**
 * 국립중앙의료원(NMC) 병원 API.
 *
 * **응답 구조는 공공데이터포털 원본 API(getHsptlMdcncFullDown)와 동일하다.**
 * 로컬 DB 에 미러링한 데이터를 원본과 같은 봉투에 담아 돌려주므로,
 * 원본 API 를 쓰던 코드가 엔드포인트만 바꿔도 그대로 동작한다.
 *
 * 적재는 hansapp-cli 의 `nmc hospital sync` 가 담당한다. 이 서버는 DB 만 읽는다.
 */
@ApiTags('nmc')
@Auth(AuthType.Jwt, AuthType.ApiKey)
@Controller('data-go-kr/nmc/hospitals')
export class NmcHospitalController {
  constructor(private readonly nmcHospitalService: NmcHospitalService) {}

  @Get()
  @ApiOperation({
    summary: '병원 목록 조회',
    description: '로컬 DB 에 미러링한 NMC 병원 목록. 응답 구조는 원본 API 와 동일하다.',
  })
  @ApiOkResponse({ schema: krDataSchemaRef(RESPONSE_SCHEMA) })
  async list(@Query() request: MirrorListRequestDto): Promise<HospitalFullDownResponse> {
    return this.nmcHospitalService.listHospitals({
      page: request.page,
      size: request.size,
    });
  }

  @Get(':hpid')
  @Header('Cache-Control', DETAIL_CACHE_CONTROL)
  @ApiOperation({
    summary: '병원 상세 조회',
    description:
      '기관ID 로 1건 조회. 없으면 items 가 빈 배열이고 totalCount 가 0 이다(원본 API 와 동일).',
  })
  @ApiParam({ name: 'hpid', description: '기관ID', example: 'A1118361' })
  @ApiOkResponse({ schema: krDataSchemaRef(RESPONSE_SCHEMA) })
  async get(@Param('hpid') hpid: string): Promise<HospitalFullDownResponse> {
    return this.nmcHospitalService.getHospital(hpid);
  }
}
