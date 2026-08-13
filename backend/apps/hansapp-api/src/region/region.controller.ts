import { Controller, Get, NotFoundException, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { RegionService } from '@hansapp/application';

import { Lang } from '../common/lang.decorator';
import type { SupportedLang } from '@hansapp/common';
import { Auth } from '../auth/auth.decorator';
import { AuthType } from '../auth/auth-type.enum';
import { ApiListResponse } from '../common/dto/api-list-response.decorator';
import { ListResponseDto } from '../common/dto/list.response.dto';
import { RegionDto } from './dto/region.dto';
import { RegionPointDto, RegionReverseRequestDto } from './dto/region-reverse.dto';

/**
 * 지역(주소) API.
 *
 * **헬스케어 밑이 아니다.** region_code 는 도메인 무관이라 —
 * 병원·학교·약국이 같이 쓴다(region-code.seed.ts 참고). 병원 전용인 것처럼
 * /healthcare/meta 밑에 두면, 다음 도메인이 붙는 순간 같은 코드를 두 군데서 내게 된다.
 *
 * **주소(address) 도메인 그룹으로 묶는다.** 영문 주소 변환(/address/english)과 같은 주소
 * 도메인이라 경로 접두사(/address)와 OpenAPI 태그(address)를 통일했다. 예전엔 최상위 /regions 였다.
 * 제공자명(/juso)이 아니라 도메인명을 쓴다 — region 은 juso.go.kr 데이터가 아니라 우리 코드라서다.
 *
 * **원본(HIRA/NMC) 지역코드가 아니라 우리 코드다.** 원본 코드가 필요하면
 * /data-go-kr/hira/regions · /data-go-kr/nmc/regions 를 본다.
 */
@ApiTags('address')
@Auth(AuthType.Jwt, AuthType.ApiKey)
@Controller('address/regions')
export class RegionController {
  constructor(private readonly service: RegionService) {}

  @Get()
  @ApiOperation({
    summary: '지역 코드',
    description:
      '시도 → 시군구 2단계다.\n\n' +
      '`level=sido` 로 시도를, `level=sggu&parent=11` 로 그 시도의 시군구를 받는다.\n\n' +
      '병원 검색의 `region` 파라미터에 시군구 코드를 넘긴다.',
  })
  @ApiQuery({ name: 'level', required: false, enum: ['sido', 'sggu'] })
  @ApiQuery({
    name: 'parent',
    required: false,
    description: '시도 코드 (시군구를 좁힐 때)',
  })
  @ApiListResponse(RegionDto)
  list(
    @Lang() lang: SupportedLang,
    @Query('level') level?: string,
    @Query('parent') parent?: string,
  ): ListResponseDto<RegionDto> {
    return new ListResponseDto(this.service.list({ level, parentCode: parent }, lang));
  }

  /*
    경로가 `/address/regions/reverse` 다. 목록(`GET /address/regions`)과 같은 그룹에 두는 건
    **클라이언트 입장에서 같은 일**이기 때문이다 — 지역 코드를 얻는다. 목록에서 고르느냐
    좌표로 찾느냐만 다르다.

    지금 구현은 병원 색인을 공간 프록시로 빌려 쓰지만(RegionService.reverse 주석 참고),
    그건 구현 세부라 URL 에 드러내지 않는다. 지역별 기준점이 들어오면 내부만 갈아끼운다.
  */
  @Get('reverse')
  @ApiOperation({
    summary: '좌표로 지역 코드 조회',
    description:
      '위경도를 주면 그 좌표가 속한 시도·시군구를 돌려준다. ' +
      '"내 위치" 버튼이 브라우저에서 받은 좌표를 지역 필터로 바꿀 때 쓴다.\n\n' +
      '받은 코드는 **병원 검색의 `region` 파라미터에 그대로** 넣으면 된다 — ' +
      '`region` 이 있으면 그 시군구 코드를, 없으면 `sido` 코드를 보낸다.\n\n' +
      '**한국 밖이거나 주변에 병원이 없으면 404** 다. 위치를 못 알아낸 것이지 오류가 아니니, ' +
      '클라이언트는 조용히 지역 선택을 비워두면 된다.',
  })
  @ApiOkResponse({ type: RegionPointDto })
  async reverse(
    @Lang() lang: SupportedLang,
    @Query() query: RegionReverseRequestDto,
  ): Promise<RegionPointDto> {
    const point = await this.service.reverse(query.lat, query.lon, lang);
    if (!point) {
      throw new NotFoundException('No region found for the given coordinates');
    }
    return point;
  }
}
