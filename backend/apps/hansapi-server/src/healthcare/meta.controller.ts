import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthcareMetaService } from '@hansapi/application';

import { Lang } from '../common/lang.decorator';
import type { SupportedLang } from '@hansapi/common';
import { Auth } from '../auth/auth.decorator';
import { AuthType } from '../auth/auth-type.enum';
import { ApiListResponse } from '../common/dto/api-list-response.decorator';
import { ListResponseDto } from '../common/dto/list.response.dto';
import {
  MetaAssessmentGroupDto,
  MetaCodeDto,
  MetaHospitalTierDto,
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
 *
 * **지역 코드는 여기 없다.** 도메인 무관이라 주소 그룹(/address/regions)으로 뺐다 — 병원만 쓰는 게 아니다.
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
  @ApiListResponse(MetaCodeDto)
  subjects(@Lang() lang: SupportedLang): ListResponseDto<MetaCodeDto> {
    return new ListResponseDto(this.service.listCodes('subject', lang));
  }

  @Get('subject-groups')
  @ApiOperation({
    summary: '진료 분야 그룹',
    description:
      '기본 검색의 칩. 47개 진료과목을 환자가 아는 이름으로 묶은 **우리 분류**다.\n\n' +
      '그룹을 고르면 subjects 의 code 들을 펼쳐서 `/healthcare/hospitals?subject=A,B,C` 로 검색한다.\n' +
      '환자가 직접 가지 않는 과(영상의학·병리·진단검사 등)는 어느 그룹에도 없다.',
  })
  @ApiListResponse(MetaSubjectGroupDto)
  subjectGroups(
    @Lang() lang: SupportedLang,
  ): ListResponseDto<MetaSubjectGroupDto> {
    return new ListResponseDto(this.service.listSubjectGroups(lang));
  }

  @Get('tiers')
  @ApiOperation({
    summary: '병원 등급',
    description:
      '종별을 등급으로 묶은 것. 의원급(TIER1) · 병원급(TIER2) · 상급종합(TIER3).\n\n' +
      '상급종합은 **진료의뢰서가 없으면 진료비 전액 본인 부담**이다.\n' +
      '요양병원·정신병원은 이 체계 밖이라 어느 등급에도 없다(NURSING·MENTAL).',
  })
  @ApiListResponse(MetaHospitalTierDto)
  tiers(@Lang() lang: SupportedLang): ListResponseDto<MetaHospitalTierDto> {
    return new ListResponseDto(this.service.listHospitalTiers(lang));
  }

  @Get('classes')
  @ApiOperation({
    summary: '종별 코드',
    description:
      '상급종합·종합병원·의원 등. 병원 검색의 category 파라미터에 쓴다.',
  })
  @ApiListResponse(MetaCodeDto)
  classes(@Lang() lang: SupportedLang): ListResponseDto<MetaCodeDto> {
    return new ListResponseDto(this.service.listCodes('class', lang));
  }

  @Get('equipments')
  @ApiOperation({ summary: '장비 코드', description: 'CT·MRI·PET 등' })
  @ApiListResponse(MetaCodeDto)
  equipments(@Lang() lang: SupportedLang): ListResponseDto<MetaCodeDto> {
    return new ListResponseDto(this.service.listCodes('equipment', lang));
  }

  @Get('severities')
  @ApiOperation({
    summary: '중증질환 처치가능 코드',
    description:
      '뇌출혈수술·심근경색 재관류 등. 응급 상황에서 갈 수 있는 병원을 가른다.',
  })
  @ApiListResponse(MetaCodeDto)
  severities(@Lang() lang: SupportedLang): ListResponseDto<MetaCodeDto> {
    return new ListResponseDto(this.service.listCodes('severe', lang));
  }

  @Get('specialties')
  @ApiOperation({
    summary: '전문병원 지정분야 코드',
    description:
      '관절·척추·심장 등. 보건복지부가 지정한 전문병원의 분야다.\n\n' +
      '병원 상세의 capabilities(type=specialty) 코드를 이 이름으로 푼다.',
  })
  @ApiListResponse(MetaCodeDto)
  specialties(@Lang() lang: SupportedLang): ListResponseDto<MetaCodeDto> {
    return new ListResponseDto(this.service.listCodes('specialty', lang));
  }

  @Get('specials')
  @ApiOperation({
    summary: '특수진료(진료가능분야) 코드',
    description:
      '방문진료·재택의료·치매주치의·중환자실 운영 등. 대부분 시범사업이다.\n\n' +
      '병원 상세의 capabilities(type=special) 코드를 이 이름으로 푼다.',
  })
  @ApiListResponse(MetaCodeDto)
  specials(@Lang() lang: SupportedLang): ListResponseDto<MetaCodeDto> {
    return new ListResponseDto(this.service.listCodes('special', lang));
  }

  @Get('assessments')
  @ApiOperation({
    summary: '건강보험심사평가원 적정성평가 분야·항목',
    description:
      '분야(급성질환·암질환 …) 밑에 평가항목(대장암·급성기뇌졸중 …)이 달린다. ' +
      '상세 검색의 assessment 필터에 쓴다 — items 의 code 를 `?assessment=12,20` 처럼 넘기면 ' +
      '그 항목에서 1등급(우수)을 받은 병원을 찾는다.',
  })
  @ApiListResponse(MetaAssessmentGroupDto)
  assessments(
    @Lang() lang: SupportedLang,
  ): ListResponseDto<MetaAssessmentGroupDto> {
    return new ListResponseDto(this.service.listAssessments(lang));
  }
}
