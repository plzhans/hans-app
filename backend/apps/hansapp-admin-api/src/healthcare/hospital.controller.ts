import { Get, HttpCode, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiPageResponse, PageResponseDto, ApiController } from '@hansapp/http-common';
import {
  HealthcareHospitalCacheInvalidator,
  HealthcareHospitalDetailService,
  HealthcareHospitalListService,
  HealthcareHospitalMetaService,
} from '@hansapp/admin-application';

import { HospitalAdminListItemDto, HospitalAdminListQueryDto } from './dto/hospital-list.dto';
import { HospitalAdminDetailDto, HospitalCacheStateDto } from './dto/hospital-detail.dto';
import { HospitalMetaDto } from './dto/hospital-meta.dto';

/**
 * healthcare_hospital 관리자 목록·상세.
 *
 * **engine 으로 저장소를 고른다** — db(기본)는 최소조건으로 전체 상태를, es 는 상세조건으로
 * 활성 병원만 본다. 조합이 안 맞으면(예: db 에서 진료과목 필터) 400 이다.
 */
@ApiTags('healthcare-hospital')
@ApiController('api')
export class HospitalController {
  constructor(
    private readonly hospitals: HealthcareHospitalListService,
    private readonly hospitalDetail: HealthcareHospitalDetailService,
    private readonly hospitalMeta: HealthcareHospitalMetaService,
    private readonly hospitalCache: HealthcareHospitalCacheInvalidator,
  ) {}

  /**
   * **`:id` 보다 먼저 등록한다.** 두 라우트가 같은 접두사(`healthcare/hospitals/*`)를
   * 쓰는데, `meta` 가 뒤에 서면 `:id` 의 ParseIntPipe 에 걸려 400 이 된다
   * (AdminAccountController 보다 AdminMeController 를 먼저 두는 것과 같은 이유).
   */
  @Get('healthcare/hospitals/meta')
  @ApiOperation({
    summary: '검색 필터 이름표',
    description: '종별·진료과목·장비·전문병원·특수진료·병원평가·지역 코드의 한국어 이름.',
  })
  @ApiOkResponse({ type: HospitalMetaDto })
  async meta(): Promise<HospitalMetaDto> {
    return new HospitalMetaDto(await this.hospitalMeta.getMeta());
  }

  @Get('healthcare/hospitals')
  @ApiOperation({
    summary: '병원 목록',
    description:
      'engine=db(기본): 전체 상태, keyword/status/classCd/regionCd 만. ' +
      'engine=es: 활성 병원만, 진료과목·장비 등 상세 조건 가능.',
  })
  @ApiPageResponse(HospitalAdminListItemDto)
  async list(
    @Query() query: HospitalAdminListQueryDto,
  ): Promise<PageResponseDto<HospitalAdminListItemDto>> {
    const page = await this.hospitals.list(query);
    return PageResponseDto.from(page.map((row) => new HospitalAdminListItemDto(row)));
  }

  @Get('healthcare/hospitals/:id')
  @ApiOperation({
    summary: '병원 상세',
    description: '상태를 가리지 않는다 — 비활성·병합된 병원도 열린다. 없으면 404.',
  })
  @ApiOkResponse({ type: HospitalAdminDetailDto })
  async get(@Param('id', ParseIntPipe) id: number): Promise<HospitalAdminDetailDto> {
    return new HospitalAdminDetailDto(await this.hospitalDetail.get(id));
  }

  @Get('healthcare/hospitals/:id/cache')
  @ApiOperation({
    summary: '이 병원의 공개 캐시 상태',
    description:
      '공개 API(hansapp-api)가 상세 조회에 쓰는 캐시(base)를 들여다본다. i18n(언어별 번역)은 ' +
      '별도 캐시라 여기 안 보이지만, 초기화는 함께 지운다.',
  })
  @ApiOkResponse({ type: HospitalCacheStateDto })
  async cacheState(@Param('id', ParseIntPipe) id: number): Promise<HospitalCacheStateDto> {
    return new HospitalCacheStateDto(await this.hospitalCache.inspect(id));
  }

  @Post('healthcare/hospitals/:id/cache/purge')
  @HttpCode(204)
  @ApiOperation({
    summary: '이 병원의 공개 캐시 삭제',
    description:
      '공개 API 가 쓰는 base·i18n(전 언어) 캐시를 함께 지운다. 데이터를 손으로 고쳤는데 ' +
      '공개 화면에 안 보일 때만 쓴다 — 평소에는 빌드가 지운다.',
  })
  @ApiNoContentResponse()
  async purgeCache(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.hospitalCache.invalidate(id);
  }
}
