import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { HealthcareMetaService } from '@hansapi/application';

import { Auth } from '../auth/auth.decorator';
import { AuthType } from '../auth/auth-type.enum';
import {
  MetaCodeDto,
  MetaHospitalTierDto,
  MetaRegionDto,
  MetaSubjectGroupDto,
} from './dto/meta.dto';

/**
 * 참조 데이터(meta) API.
 *
 * 검색 조건으로 쓰는 코드 목록이다. 드롭다운을 채우는 용도라 병원 데이터와 성격이 달라
 * /healthcare/meta 아래로 묶었다.
 *
 * **원본(HIRA/NMC) 코드가 아니라 우리 코드다.** 원본 코드는 응답에 내지 않는다 —
 * 우리 내부 매핑이고, 사용자가 알 필요가 없다.
 * (원본 코드가 필요하면 /data-go-kr/hira/codes · /data-go-kr/nmc/codes 를 본다)
 */
@ApiTags('healthcare-meta')
@Auth(AuthType.Jwt, AuthType.ApiKey)
@Controller('healthcare/meta')
export class HealthcareMetaController {
  constructor(private readonly service: HealthcareMetaService) {}

  @Get('subjects')
  @ApiOperation({
    summary: '진료과목 코드',
    description: '병원 검색의 subject 파라미터에 쓴다.',
  })
  @ApiOkResponse({ type: [MetaCodeDto] })
  async subjects(): Promise<MetaCodeDto[]> {
    return this.service.listCodes('subject');
  }

  @Get('subject-groups')
  @ApiOperation({
    summary: '진료 분야 그룹',
    description:
      '기본 검색의 칩. 47개 진료과목을 환자가 아는 이름으로 묶은 **우리 분류**다.\n\n' +
      '그룹을 고르면 subjects 의 code 들을 펼쳐서 `/healthcare/hospitals?subject=A,B,C` 로 검색한다.\n' +
      '환자가 직접 가지 않는 과(영상의학·병리·진단검사 등)는 어느 그룹에도 없다.',
  })
  @ApiOkResponse({ type: [MetaSubjectGroupDto] })
  async subjectGroups(): Promise<MetaSubjectGroupDto[]> {
    return this.service.listSubjectGroups();
  }

  @Get('tiers')
  @ApiOperation({
    summary: '병원 등급 (TIER1~3)',
    description:
      '종별을 등급으로 묶은 것. 의원급(TIER1) · 병원급(TIER2) · 상급종합(TIER3).\n\n' +
      '상급종합은 **진료의뢰서가 없으면 진료비 전액 본인 부담**이다.\n' +
      '요양병원·정신병원은 이 체계 밖이라 어느 등급에도 없다(NURSING·MENTAL).',
  })
  @ApiOkResponse({ type: [MetaHospitalTierDto] })
  async tiers(): Promise<MetaHospitalTierDto[]> {
    return this.service.listHospitalTiers();
  }

  @Get('classes')
  @ApiOperation({
    summary: '종별 코드',
    description:
      '상급종합·종합병원·의원 등. 병원 검색의 category 파라미터에 쓴다.',
  })
  @ApiOkResponse({ type: [MetaCodeDto] })
  async classes(): Promise<MetaCodeDto[]> {
    return this.service.listCodes('class');
  }

  @Get('equipments')
  @ApiOperation({ summary: '장비 코드', description: 'CT·MRI·PET 등' })
  @ApiOkResponse({ type: [MetaCodeDto] })
  async equipments(): Promise<MetaCodeDto[]> {
    return this.service.listCodes('equipment');
  }

  @Get('severities')
  @ApiOperation({
    summary: '중증질환 처치가능 코드',
    description:
      '뇌출혈수술·심근경색 재관류 등. 응급 상황에서 갈 수 있는 병원을 가른다.',
  })
  @ApiOkResponse({ type: [MetaCodeDto] })
  async severities(): Promise<MetaCodeDto[]> {
    return this.service.listCodes('severe');
  }

  @Get('regions')
  @ApiOperation({
    summary: '지역 코드',
    description:
      'level=sido 로 시도를, level=sggu&parent=11 로 그 시도의 시군구를 받는다.',
  })
  @ApiQuery({ name: 'level', required: false, enum: ['sido', 'sggu'] })
  @ApiQuery({
    name: 'parent',
    required: false,
    description: '시도 코드 (시군구를 좁힐 때)',
  })
  @ApiOkResponse({ type: [MetaRegionDto] })
  async regions(
    @Query('level') level?: string,
    @Query('parent') parent?: string,
  ): Promise<MetaRegionDto[]> {
    return this.service.listRegions({ level, parentCode: parent });
  }
}
