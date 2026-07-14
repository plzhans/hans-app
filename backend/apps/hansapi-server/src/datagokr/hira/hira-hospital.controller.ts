import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { HiraHospitalService } from '@hansapi/application';
import type { HospitalListResponse } from '@krdata/hira';

import { Auth } from '../../auth/auth.decorator';
import { AuthType } from '../../auth/auth-type.enum';
import { krDataSchemaRef } from '../../krdata-schemas';
import { MirrorListRequestDto } from '../dto/mirror-list.request.dto';

/** 병합된 SDK 스펙의 응답 스키마. 필드 설명이 거기 다 들어있다. */
const RESPONSE_SCHEMA = 'HiraHospitalListResponse';

/**
 * 건강보험심사평가원(HIRA) 병원 API.
 *
 * **응답 구조는 공공데이터포털 원본 API(hospInfoServicev2/getHospBasisList)와 동일하다.**
 * 로컬 DB 에 미러링한 데이터를 원본과 같은 봉투에 담아 돌려준다.
 *
 * 적재는 hansapi-cli 의 `hira hospital sync` 가 담당한다. 이 서버는 DB 만 읽는다.
 */
@ApiTags('hira')
@Auth(AuthType.Jwt, AuthType.ApiKey)
@Controller('data-go-kr/hira/hospitals')
export class HiraHospitalController {
  constructor(private readonly hiraHospitalService: HiraHospitalService) {}

  @Get()
  @ApiOperation({
    summary: '병원 목록 조회',
    description:
      '로컬 DB 에 미러링한 HIRA 병원 목록. 응답 구조는 원본 API 와 동일하다.',
  })
  @ApiOkResponse({ schema: krDataSchemaRef(RESPONSE_SCHEMA) })
  async list(
    @Query() request: MirrorListRequestDto,
  ): Promise<HospitalListResponse> {
    return this.hiraHospitalService.listHospitals({
      page: request.page,
      size: request.size,
    });
  }

  @Get(':ykiho')
  @ApiOperation({
    summary: '병원 상세 조회',
    description:
      '암호화된 요양기호로 1건 조회. 없으면 items 가 빈 배열이고 totalCount 가 0 이다.',
  })
  @ApiParam({
    name: 'ykiho',
    description: '암호화된 요양기호. 목록 응답의 ykiho 를 그대로 쓴다.',
  })
  @ApiOkResponse({ schema: krDataSchemaRef(RESPONSE_SCHEMA) })
  async get(@Param('ykiho') ykiho: string): Promise<HospitalListResponse> {
    return this.hiraHospitalService.getHospital(ykiho);
  }
}
