import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { RegionService } from '@hansapi/application';

import { Lang } from '../common/lang.decorator';
import type { SupportedLang } from '@hansapi/common';
import { Auth } from '../auth/auth.decorator';
import { AuthType } from '../auth/auth-type.enum';
import { ApiListResponse } from '../common/dto/api-list-response.decorator';
import { ListResponseDto } from '../common/dto/list.response.dto';
import { RegionDto } from './dto/region.dto';

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
  async list(
    @Lang() lang: SupportedLang,
    @Query('level') level?: string,
    @Query('parent') parent?: string,
  ): Promise<ListResponseDto<RegionDto>> {
    return new ListResponseDto(
      await this.service.list({ level, parentCode: parent }, lang),
    );
  }
}
