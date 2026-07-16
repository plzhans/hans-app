import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiExcludeEndpoint,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { HiraHospitalService } from '@hansapi/application';
import type {
  ClinicTop5Response,
  HospitalListResponse,
  NonPaymentDetailResponse,
} from '@krdata/hira';

import { Auth } from '../../auth/auth.decorator';
import { AuthType } from '../../auth/auth-type.enum';
import { krDataSchemaRef } from '../../krdata-schemas';
import { MirrorListRequestDto } from '../dto/mirror-list.request.dto';

/** 병합된 SDK 스펙의 응답 스키마. 필드 설명이 거기 다 들어있다. */
const RESPONSE_SCHEMA = 'HiraHospitalListResponse';

/** 상위질병5는 다른 서비스(hospDiagInfoService1)라 봉투가 따로다. */
const CLINIC_TOP5_SCHEMA = 'HiraClinicTop5Response';

/** 비급여도 다른 서비스(nonPaymentDamtInfoService)라 봉투가 따로다. */
const NPAY_SCHEMA = 'HiraNonPaymentDetailResponse';

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

  @Get(':ykiho/npay')
  @ApiOperation({
    summary: '비급여 진료비 조회',
    description:
      '기관이 신고한 비급여 항목별 실제 청구금액(curAmt). 응답 구조는 원본 API 와 동일하다.\n\n' +
      '**병원급 이상만 있다** — 의원(clCd=31)은 원본에 통째로 없어 늘 빈 배열이다. ' +
      '**한 기관에 수백 행이다**(최다 1,048건) — 페이지로 받아라.',
  })
  @ApiParam({
    name: 'ykiho',
    description:
      '암호화된 요양기호. 통합 병원 상세(/healthcare/hospitals/:id)의 ykiho 를 그대로 쓴다.',
  })
  @ApiOkResponse({ schema: krDataSchemaRef(NPAY_SCHEMA) })
  async getNonPayments(
    @Param('ykiho') ykiho: string,
    @Query() request: MirrorListRequestDto,
  ): Promise<NonPaymentDetailResponse> {
    return this.hiraHospitalService.getNonPayments(ykiho, {
      page: request.page,
      size: request.size,
    });
  }

  /**
   * 의원 진료 상위질병 5개. **원본 데이터가 신뢰할 수 없어 문서에서 감춘다.**
   *
   * 라우트는 살아 있다. 원본이 정상화되면 @ApiExcludeEndpoint 한 줄만 떼면 된다.
   * 감추는 이유는 원본 응답이 과목과 전혀 맞지 않기 때문이다 (2026-07 실측):
   *   - 소아청소년과의원에 자궁근종·뇌종양_악성·알코올성 간질환이 상위로 온다.
   *   - 서로 다른 소아과 3곳이 거의 같은 세트를 돌려준다. 진료량 상위라면 나올 수 없다.
   *   - 같은 ykiho 를 반복 호출하면 값은 늘 같다. 랜덤이 아니라 결정적으로 이상하다.
   * 우리 매핑 문제가 아니다 — 원본 API 를 직접 때려도 같고, 응답의 yadmNm/shwSbjtCdNm 은
   * 요청한 의원과 정확히 일치한다. 자세한 근거는 clients/README.md 의 HIRA 절.
   *
   * 그래서 적재 대상에서 아예 뺐다(HIRA_EXTRA_OPS). 쓸 수 없는 데이터에 의원 37,789곳 ×
   * 1콜을 태울 이유가 없다. 이 라우트는 늘 빈 배열을 돌려준다고 보면 된다.
   */
  @Get(':ykiho/clinic-top5')
  @ApiExcludeEndpoint()
  @ApiOkResponse({ schema: krDataSchemaRef(CLINIC_TOP5_SCHEMA) })
  async getClinicTop5(
    @Param('ykiho') ykiho: string,
  ): Promise<ClinicTop5Response> {
    return this.hiraHospitalService.getClinicTop5(ykiho);
  }
}
