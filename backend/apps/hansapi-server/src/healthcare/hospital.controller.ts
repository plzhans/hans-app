import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  HealthcareHospitalService,
  HealthcareNonPaymentService,
} from '@hansapi/application';

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
import {
  HospitalNonPaymentDto,
  NonPaymentRequestResultDto,
} from './dto/npay.dto';

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
  constructor(
    private readonly service: HealthcareHospitalService,
    private readonly npay: HealthcareNonPaymentService,
  ) {}

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
        specialistCds: csv(request.specialist),
        name: request.name,
        emergency: request.emergency === 'true',
        baby: request.baby === 'true',
        // 평가 항목 코드(01,12,20 …). 아는 코드만 서비스가 통과시킨다(인젝션 방지).
        asmItemCds: csv(request.assessment),
        specialtyCds: csv(request.specialty),
        specialCds: csv(request.special),
        equipmentCds: csv(request.equipment),
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

  @Get(':id/hira-npay')
  @ApiOperation({
    summary: '비급여 진료비',
    description:
      '병원이 신고한 비급여 항목별 가격. 대분류 → 표준코드로 묶어 **기관 전건을 한 번에** 돌려준다(페이지 없음).\n\n' +
      '**빈 categories 가 정상이다.** 비급여를 신고한 기관은 3,511곳(전체의 4.4%)뿐이고, ' +
      '의원(clCd=31)은 원본에 통째로 없어 늘 비어 있다. 병원이 없을 때만 404 다.\n\n' +
      '**금액은 범위다.** 한 표준코드에 원본 행이 여럿일 수 있어서다(체외충격파가 단순/복잡 두 행). ' +
      '단일가면 minAmount 와 maxAmount 가 같다 — 그때는 범위로 표시하지 마라.\n\n' +
      '상세(/healthcare/hospitals/:id)에 끼워 넣지 않은 이유는 95% 의 병원에게 헛짐이고 ' +
      '한 기관에 수백 행이기 때문이다(최다 1,048행).',
  })
  @ApiParam({ name: 'id', description: '통합 병원 id' })
  @ApiOkResponse({ type: HospitalNonPaymentDto })
  async nonPayments(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<HospitalNonPaymentDto> {
    const npay = await this.npay.get(id);
    if (!npay) {
      throw new NotFoundException(`병원을 찾을 수 없습니다: ${id}`);
    }
    return npay;
  }

  @Post(':id/hira-npay/request')
  @ApiOperation({
    summary: '비급여 갱신 요청',
    description:
      '이 병원의 비급여를 받아오도록 **요청만 한다.** 즉시 반영되지 않는다 — 큐에 등록되고 배치가 처리한다.\n\n' +
      '**`source=requestable` 일 때만 의미가 있다.** 공개 API 에 이미 있으면(`hira`) 요청할 이유가 없고, ' +
      '받아봤는데 없으면(`none`) 다시 요청해도 결과가 같다.\n\n' +
      '**같은 병원을 여러 번 눌러도 큐에는 한 줄이다.** 처리 결과는 다음 조회의 `source` 로 나타난다(web|none).',
  })
  @ApiParam({ name: 'id', description: '통합 병원 id' })
  @ApiOkResponse({ type: NonPaymentRequestResultDto })
  async requestNonPayments(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<NonPaymentRequestResultDto> {
    const result = await this.npay.request(id);
    if (!result) {
      throw new NotFoundException(`병원을 찾을 수 없습니다: ${id}`);
    }
    if (result === 'unavailable') {
      // HIRA 연동이 없는 병원. 큐에 넣어봐야 배치가 할 수 있는 게 없다.
      throw new NotFoundException(
        `HIRA 연동이 없어 비급여를 받아올 수 없는 병원입니다: ${id}`,
      );
    }
    return { result };
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
