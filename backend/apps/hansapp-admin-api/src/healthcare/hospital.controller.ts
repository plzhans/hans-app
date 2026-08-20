import { Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiPageResponse, PageResponseDto, ApiController } from '@hansapp/http-common';
import { HealthcareHospitalListService } from '@hansapp/admin-application';

import { HospitalAdminListItemDto, HospitalAdminListQueryDto } from './dto/hospital-list.dto';

/**
 * healthcare_hospital 관리자 목록.
 *
 * **engine 으로 저장소를 고른다** — db(기본)는 최소조건으로 전체 상태를, es 는 상세조건으로
 * 활성 병원만 본다. 조합이 안 맞으면(예: db 에서 진료과목 필터) 400 이다.
 */
@ApiTags('healthcare-hospital')
@ApiController('api')
export class HospitalController {
  constructor(private readonly hospitals: HealthcareHospitalListService) {}

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
}
