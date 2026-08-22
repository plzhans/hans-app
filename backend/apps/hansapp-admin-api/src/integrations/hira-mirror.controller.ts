import { Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiPageResponse, PageResponseDto, ApiController } from '@hansapp/http-common';
import {
  HiraMirrorDashboardService,
  HiraMirrorDetailService,
  HiraMirrorListService,
} from '@hansapp/admin-application';

import {
  HiraMirrorDetailDto,
  HiraMirrorListItemDto,
  HiraMirrorListQueryDto,
} from './dto/hira-mirror.dto';
import { MirrorTableCountDto } from './dto/mirror-section.dto';

/**
 * HIRA 병원 미러(hira_hospital 계열) 조회. **healthcare_hospital(통합병원)과 무관하다** —
 * 관리자가 "HIRA 원본이 뭘 가지고 있나" 를 그대로 확인하는 자리다.
 */
@ApiTags('integrations-hira')
@ApiController('api')
export class HiraMirrorController {
  constructor(
    private readonly list: HiraMirrorListService,
    private readonly detail: HiraMirrorDetailService,
    private readonly dashboard: HiraMirrorDashboardService,
  ) {}

  @Get('integrations/hira/dashboard')
  @ApiOperation({
    summary: 'HIRA 연동 데이터 대시보드',
    description: '테이블(또는 오퍼레이션)별 건수. "기본 정보" 한 줄에만 목록 화면 경로가 있다.',
  })
  @ApiOkResponse({ type: MirrorTableCountDto, isArray: true })
  async getDashboard(): Promise<MirrorTableCountDto[]> {
    const rows = await this.dashboard.getTableCounts();
    return rows.map((row) => new MirrorTableCountDto(row));
  }

  @Get('integrations/hira/hospitals')
  @ApiOperation({
    summary: 'HIRA 병원 미러 목록',
    description: 'hira_hospital 을 병원명·요양기호·지역·종별로 찾는다.',
  })
  @ApiPageResponse(HiraMirrorListItemDto)
  async listHospitals(
    @Query() query: HiraMirrorListQueryDto,
  ): Promise<PageResponseDto<HiraMirrorListItemDto>> {
    const page = await this.list.list(query);
    return PageResponseDto.from(page.map((row) => new HiraMirrorListItemDto(row)));
  }

  @Get('integrations/hira/hospitals/:ykiho')
  @ApiOperation({
    summary: 'HIRA 병원 미러 상세',
    description:
      '기본목록·진료과목·장비·검색코드·평가·비급여·상세 11 오퍼레이션을 구간별로 낸다. 없으면 404.',
  })
  @ApiOkResponse({ type: HiraMirrorDetailDto })
  async getHospital(@Param('ykiho') ykiho: string): Promise<HiraMirrorDetailDto> {
    return new HiraMirrorDetailDto(await this.detail.get(ykiho));
  }
}
