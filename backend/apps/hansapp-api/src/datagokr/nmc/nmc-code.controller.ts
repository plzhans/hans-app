import { Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiController } from '@hansapp/http-common';
import { NmcCodeService } from '@hansapp/application';
import type { CodeInfoResponse } from '@krdata/nmc';

import { Auth } from '../../auth/auth.decorator';
import { AuthType } from '../../auth/auth-type.enum';
import { krDataSchemaRef } from '../../krdata-schemas';
import { NmcCodeListRequestDto } from '../dto/nmc-code-list.request.dto';

/** 병합된 SDK 스펙의 응답 스키마. 필드 설명이 거기 다 들어있다. */
const RESPONSE_SCHEMA = 'NmcCodeInfoResponse';

/**
 * 국립중앙의료원(NMC) 코드마스터 API.
 *
 * **응답 구조는 공공데이터포털 원본 API(CodeMast/info)와 동일하다.**
 * NMC 는 코드 체계가 하나(cmMid/cmSid)라 대분류코드(cmMid)로 좁히기만 하면 된다.
 *
 * 적재는 hansapp-cli 의 `nmc code sync` 가 담당한다. 이 서버는 DB 만 읽는다.
 */
@ApiTags('nmc')
@Auth(AuthType.Jwt, AuthType.ApiKey)
@ApiController('data-go-kr/nmc/codes')
export class NmcCodeController {
  constructor(private readonly nmcCodeService: NmcCodeService) {}

  @Get()
  @ApiOperation({
    summary: '코드마스터 목록 조회',
    description: '로컬 DB 에 미러링한 NMC 코드마스터. 응답 구조는 원본 API 와 동일하다.',
  })
  @ApiOkResponse({ schema: krDataSchemaRef(RESPONSE_SCHEMA) })
  async list(@Query() request: NmcCodeListRequestDto): Promise<CodeInfoResponse> {
    return this.nmcCodeService.listCodes({
      cmMid: request.cmMid,
      page: request.page,
      size: request.size,
    });
  }
}
