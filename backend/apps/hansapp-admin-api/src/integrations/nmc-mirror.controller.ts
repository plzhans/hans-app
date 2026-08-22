import { Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiPageResponse, PageResponseDto, ApiController } from '@hansapp/http-common';
import {
  NmcMirrorDashboardService,
  NmcMirrorDetailService,
  NmcMirrorListService,
} from '@hansapp/admin-application';

import {
  NmcMirrorDetailDto,
  NmcMirrorListItemDto,
  NmcMirrorListQueryDto,
} from './dto/nmc-mirror.dto';
import { MirrorTableCountDto } from './dto/mirror-section.dto';

/**
 * NMC 병원 미러(nmc_hospital 계열) 조회. **healthcare_hospital(통합병원)과 무관하다** —
 * 관리자가 "NMC 원본이 뭘 가지고 있나" 를 그대로 확인하는 자리다.
 */
@ApiTags('integrations-nmc')
@ApiController('api')
export class NmcMirrorController {
  constructor(
    private readonly list: NmcMirrorListService,
    private readonly detail: NmcMirrorDetailService,
    private readonly dashboard: NmcMirrorDashboardService,
  ) {}

  @Get('integrations/nmc/dashboard')
  @ApiOperation({
    summary: 'NMC 연동 데이터 대시보드',
    description: '테이블별 건수. "기본목록" 한 줄에만 목록 화면 경로가 있다.',
  })
  @ApiOkResponse({ type: MirrorTableCountDto, isArray: true })
  async getDashboard(): Promise<MirrorTableCountDto[]> {
    const rows = await this.dashboard.getTableCounts();
    return rows.map((row) => new MirrorTableCountDto(row));
  }

  @Get('integrations/nmc/hospitals')
  @ApiOperation({
    summary: 'NMC 병원 미러 목록',
    description: 'nmc_hospital 을 병원명·기관ID·지역·기관구분으로 찾는다.',
  })
  @ApiPageResponse(NmcMirrorListItemDto)
  async listHospitals(
    @Query() query: NmcMirrorListQueryDto,
  ): Promise<PageResponseDto<NmcMirrorListItemDto>> {
    const page = await this.list.list(query);
    return PageResponseDto.from(page.map((row) => new NmcMirrorListItemDto(row)));
  }

  @Get('integrations/nmc/hospitals/:hpid')
  @ApiOperation({
    summary: 'NMC 병원 미러 상세',
    description: '기본목록·상세기본정보(basic)·진료과목·달빛어린이를 구간별로 낸다. 없으면 404.',
  })
  @ApiOkResponse({ type: NmcMirrorDetailDto })
  async getHospital(@Param('hpid') hpid: string): Promise<NmcMirrorDetailDto> {
    return new NmcMirrorDetailDto(await this.detail.get(hpid));
  }
}
