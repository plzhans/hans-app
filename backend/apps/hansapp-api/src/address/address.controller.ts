import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Auth } from '../auth/auth.decorator';
import { AuthType } from '../auth/auth-type.enum';
import { ApiPageResponse, PageResponseDto } from '@hansapp/http-common';
import { AddressService } from './address.service';
import { AddressDto, AddressSearchRequestDto } from './dto/address.dto';

/**
 * 도로명주소 영문 번역 API.
 *
 * 한글 주소를 넣으면 공식 **영문 표기**로 바꿔 준다. 도로명주소 개발자센터(juso.go.kr)를
 * 조회한다 — 주소는 지어내면 안 되는 값이라 공식 로마자 표기를 그대로 가져온다.
 */
@ApiTags('address')
@Auth(AuthType.Jwt, AuthType.ApiKey)
@Controller('address')
export class AddressController {
  constructor(private readonly service: AddressService) {}

  @Get('english')
  @ApiOperation({
    summary: '영문 주소 검색',
    description:
      '한글 주소(또는 일부)를 검색해 매칭되는 주소를 **영문 표기**와 함께 반환한다.\n\n' +
      '**시/도명 단독·한 글자·숫자만으로는 검색되지 않는다**(도로명주소 API 제약). ' +
      '결과가 없으면 빈 목록을 반환한다.',
  })
  @ApiPageResponse(AddressDto)
  async searchEnglish(
    @Query() request: AddressSearchRequestDto,
  ): Promise<PageResponseDto<AddressDto>> {
    const page = await this.service.search({
      keyword: request.keyword,
      page: request.page,
      size: request.size,
    });
    return new PageResponseDto(page, page.items);
  }
}
