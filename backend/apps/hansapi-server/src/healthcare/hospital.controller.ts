import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { HealthcareHospitalService } from '@hansapi/application';

import { Lang } from '../common/lang.decorator';
import type { SupportedLang } from '@hansapi/common';
import { Auth } from '../auth/auth.decorator';
import { AuthType } from '../auth/auth-type.enum';
import { ApiPageResponse } from '../common/dto/api-page-response.decorator';
import { PageResponseDto } from '../common/dto/page.response.dto';
import {
  HospitalDetailDto,
  HospitalSearchRequestDto,
  HospitalSummaryDto,
} from './dto/hospital.dto';

/**
 * 통합 병원 API.
 *
 * **한 병원이 한 행이다.** 예전에는 `?source=hira|nmc` 로 어느 원본을 볼지 골랐는데,
 * 그러면 같은 병원이 두 번 나오고 반쪽 데이터만 보였다(HIRA 는 진료시간·응급실이 없고,
 * NMC 는 병상·장비가 없다). 이제 둘을 매칭해 합친 결과를 낸다.
 *
 * 코드는 전부 우리 코드다. 목록은 /healthcare/meta 에서 받는다.
 */
@ApiTags('healthcare')
@Auth(AuthType.Jwt, AuthType.ApiKey)
@Controller('healthcare/hospitals')
export class HealthcareHospitalController {
  constructor(private readonly service: HealthcareHospitalService) {}

  @Get()
  @ApiOperation({
    summary: '병원 검색',
    description:
      '지역·종별·진료과목·병원명으로 검색한다. 응급실 운영, 달빛어린이병원 필터도 있다.',
  })
  @ApiPageResponse(HospitalSummaryDto)
  async search(
    @Query() request: HospitalSearchRequestDto,
    @Lang() lang: SupportedLang,
  ): Promise<PageResponseDto<HospitalSummaryDto>> {
    const page = await this.service.search(
      {
        page: request.page,
        size: request.size,
        regionCd: request.region,
        classCds: csv(request.category),
        tiers: csv(request.tier),
        subjectCds: csv(request.subject),
        name: request.name,
        emergency: request.emergency === 'true',
        baby: request.baby === 'true',
      },
      lang,
    );

    return new PageResponseDto(page, page.items);
  }

  @Get(':id')
  @ApiOperation({
    summary: '병원 상세',
    description:
      '진료과목·진료시간·인력·병상·장비·역량을 함께 반환한다. ' +
      '진료시간은 kind 로 갈린다 — general(일반)과 baby(달빛어린이)는 시간대가 다르다.',
  })
  @ApiParam({ name: 'id', description: '통합 병원 id' })
  @ApiOkResponse({ type: HospitalDetailDto })
  async get(
    @Param('id', ParseIntPipe) id: number,
    @Lang() lang: SupportedLang,
  ): Promise<HospitalDetailDto> {
    const hospital = await this.service.get(id, lang);
    if (!hospital) {
      throw new NotFoundException(`병원을 찾을 수 없습니다: ${id}`);
    }
    return hospital;
  }
}

/** 'A,B,C' → ['A','B','C']. 빈 값은 버린다 — 빈 문자열이 코드로 들어가면 아무것도 안 걸린다. */
function csv(value?: string): string[] | undefined {
  if (!value) {
    return undefined;
  }
  const codes = value
    .split(',')
    .map((code) => code.trim())
    .filter(Boolean);
  return codes.length > 0 ? codes : undefined;
}
