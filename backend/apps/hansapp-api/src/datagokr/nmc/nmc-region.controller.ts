import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { NmcRegionService, NmcSubjectService } from '@hansapp/application';

import { Auth } from '../../auth/auth.decorator';
import { AuthType } from '../../auth/auth-type.enum';
import { MirrorListRequestDto } from '../dto/mirror-list.request.dto';
import { NmcRegionResponseDto, NmcSubjectResponseDto } from '../dto/krdata-envelope.dto';

/**
 * 국립중앙의료원(NMC) 지역·진료과목 API.
 *
 * **원본 API 에 대응이 없는 데이터다.**
 * - 지역: NMC 는 지역을 코드로 주지 않는다(주소 문자열뿐). 주소를 파싱해 집계했다.
 *   코드마스터의 지역 코드는 행정개편 미반영이라 쓸 수 없다(전남광주통합특별시가 없다).
 * - 진료과목: 원본은 병원별 단건 API(basic)로만 준다. 병원 목록의 QD 필터를 과목별로
 *   뒤집어 조회해(~50콜) 매핑을 만들었다. 병원별로 받으면 78,631콜이다.
 *
 * 응답 봉투는 원본 API 와 같은 구조를 유지한다.
 */
@ApiTags('nmc')
@Auth(AuthType.Jwt, AuthType.ApiKey)
@Controller('data-go-kr/nmc')
export class NmcRegionController {
  constructor(
    private readonly regionService: NmcRegionService,
    private readonly subjectService: NmcSubjectService,
  ) {}

  @Get('regions')
  @ApiOperation({
    summary: '지역 목록 조회',
    description: '병원 데이터에서 집계한 시도·시군구 목록. 병원이 1건 이상 있는 지역만 나온다.',
  })
  @ApiOkResponse({ type: NmcRegionResponseDto })
  async listRegions(@Query() request: MirrorListRequestDto) {
    return this.regionService.listRegions({
      page: request.page,
      size: request.size,
    });
  }

  @Get('hospitals/:hpid/subjects')
  @ApiOperation({
    summary: '병원 진료과목 조회',
    description: '해당 병원이 진료하는 과목 목록. 코드마스터 D000 기준이다.',
  })
  @ApiParam({ name: 'hpid', description: '기관ID', example: 'A1100001' })
  @ApiOkResponse({ type: NmcSubjectResponseDto })
  async listSubjects(@Param('hpid') hpid: string) {
    return this.subjectService.listByHospital(hpid);
  }
}
