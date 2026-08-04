import {
  Controller,
  Get,
  Header,
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
  type HospitalBbox,
  type HospitalCoords,
} from '@hansapp/application';

import { Lang } from '../common/lang.decorator';
import type { SupportedLang } from '@hansapp/common';
import { DETAIL_CACHE_CONTROL } from '../common/cache-control';
import { Auth } from '../auth/auth.decorator';
import { AuthType } from '../auth/auth-type.enum';
import { ApiPageResponse } from '../common/dto/api-page-response.decorator';
import { PageResponseDto } from '../common/dto/page.response.dto';
import { ApiScrollResponse } from '../common/dto/api-scroll-response.decorator';
import { ScrollResponseDto } from '../common/dto/scroll.response.dto';
import {
  HospitalDetailDto,
  HospitalFilterRequestDto,
  HospitalNearbyRequestDto,
  HospitalNearbyResponseDto,
  HospitalScrollRequestDto,
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
        // 지도 영역·정렬. 넷이 다 와야 사각형이고, 거리순은 lat/lon 이 있어야 성립한다.
        bbox: bboxOf(request),
        sort: request.sort,
        origin: originOf(request),
      },
      lang,
    );

    return new PageResponseDto(page, page.items);
  }

  @Get('scroll')
  @ApiOperation({
    summary: '병원 무한 스크롤',
    description:
      '검색(GET /healthcare/hospitals)과 **필터는 같고 페이징 방식만 다르다.** ' +
      '페이지 번호 대신 nextToken 으로 이어 받는다 — 무한 스크롤 화면용이다.\n\n' +
      '**첫 호출은 nextToken 없이** 필터만 보낸다. 응답의 nextToken 을 다음 호출에 ' +
      '그대로 실어 보내면 이어진다. **nextToken 이 없으면 마지막 페이지다** — 그만 부른다.',
  })
  @ApiScrollResponse(HospitalSummaryDto)
  async scroll(
    @Query() request: HospitalScrollRequestDto,
    @Lang() lang: SupportedLang,
  ): Promise<ScrollResponseDto<HospitalSummaryDto>> {
    const result = await this.service.scroll(
      {
        size: request.size,
        nextToken: request.nextToken,
        // 기본 ES. db=true 일 때만 DB 로 우회한다(테스트 스위치).
        db: request.db === 'true',
        regionCd: request.region,
        classCds: csv(request.category),
        tiers: csv(request.tier),
        subjectCds: csv(request.subject),
        specialistCds: csv(request.specialist),
        name: request.name,
        emergency: request.emergency === 'true',
        baby: request.baby === 'true',
        asmItemCds: csv(request.assessment),
        specialtyCds: csv(request.specialty),
        specialCds: csv(request.special),
        equipmentCds: csv(request.equipment),
        // 지도 영역·정렬. 넷이 다 와야 사각형이고, 거리순은 lat/lon 이 있어야 성립한다.
        bbox: bboxOf(request),
        sort: request.sort,
        origin: originOf(request),
      },
      lang,
    );

    return new ScrollResponseDto(result.items, result.nextToken);
  }

  @Get(':id')
  @Header('Cache-Control', DETAIL_CACHE_CONTROL)
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
      throw new NotFoundException(`Hospital not found: ${id}`);
    }
    return hospital;
  }

  @Get(':id/nearby')
  @Header('Cache-Control', DETAIL_CACHE_CONTROL)
  @ApiOperation({
    summary: '근처의 유사한 병원',
    description:
      '이 병원 **대신 갈 만한** 근처 병원을 찾는다. 상세 화면 하단 섹션용이다.\n\n' +
      '**단순히 가까운 순이 아니다.** 진료과목이 겹치는지를 가장 크게 보고, ' +
      '전문병원 지정분야·종별·응급실 운영 여부로 보정한 뒤, 거리를 가중치로 곱해 정렬한다. ' +
      '바로 옆 치과가 1km 밖 같은 정형외과를 이기지 않는다는 뜻이다.\n\n' +
      '**왜 유사한지는 matchedSubjects 로 돌려준다** — 겹친 과목을 그대로 실어 주므로 ' +
      '"정형외과·재활의학과" 같은 배지를 달 수 있다.\n\n' +
      '요양병원·정신병원은 기본적으로 빠지지만, **기준 병원이 그 계열이면 같은 계열만** 찾는다 ' +
      '— 요양병원 보는 사람에게 근처 의원은 대체재가 아니다.\n\n' +
      '결과가 비어도 정상이다(좌표가 없는 병원이거나 반경 안에 후보가 없다). ' +
      '병원 자체가 없을 때만 404 다.',
  })
  @ApiParam({ name: 'id', description: '기준이 될 통합 병원 id' })
  @ApiOkResponse({ type: HospitalNearbyResponseDto })
  async nearby(
    @Param('id', ParseIntPipe) id: number,
    @Query() request: HospitalNearbyRequestDto,
    @Lang() lang: SupportedLang,
  ): Promise<HospitalNearbyResponseDto> {
    const result = await this.service.nearby(
      { id, radius: request.radius, size: request.size },
      lang,
    );
    if (!result) {
      throw new NotFoundException(`Hospital not found: ${id}`);
    }
    return result;
  }

  @Get(':id/hira-npay')
  @Header('Cache-Control', DETAIL_CACHE_CONTROL)
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
      throw new NotFoundException(`Hospital not found: ${id}`);
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
      throw new NotFoundException(`Hospital not found: ${id}`);
    }
    if (result === 'unavailable') {
      // HIRA 연동이 없는 병원. 큐에 넣어봐야 배치가 할 수 있는 게 없다.
      throw new NotFoundException(
        `Hospital has no HIRA link, non-payment data unavailable: ${id}`,
      );
    }
    return { result };
  }
}

/**
 * 지도 영역 넷 → bbox. **하나라도 빠지면 undefined 다** — 세 변짜리 사각형은 없다.
 * 뒤집혀 온 값(min > max)은 서로 바꿔 담는다. 지도를 어느 방향으로 끌었든 사각형은 같다.
 */
function bboxOf(request: HospitalFilterRequestDto): HospitalBbox | undefined {
  const { minLat, minLon, maxLat, maxLon } = request;
  if (
    minLat === undefined ||
    minLon === undefined ||
    maxLat === undefined ||
    maxLon === undefined
  ) {
    return undefined;
  }
  return {
    minLat: Math.min(minLat, maxLat),
    minLon: Math.min(minLon, maxLon),
    maxLat: Math.max(minLat, maxLat),
    maxLon: Math.max(minLon, maxLon),
  };
}

/**
 * 거리 계산 기준점. **둘 다 와야 한다** — 위도만으로는 잴 수 없다.
 * 하나만 온 경우 여기서 버리면, sort=distance 였을 때 서비스가 400 으로 막아 준다.
 */
function originOf(
  request: HospitalFilterRequestDto,
): HospitalCoords | undefined {
  const { lat, lon } = request;
  return lat !== undefined && lon !== undefined ? { lat, lon } : undefined;
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
