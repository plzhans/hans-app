import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Auth } from '../auth/auth.decorator';
import { AuthType } from '../auth/auth-type.enum';
import { BusinessService } from './business.service';
import {
  BnoParamDto,
  BusinessStatusDto,
  BusinessVerificationDto,
  BusinessVerifyRequestDto,
} from './dto/business.dto';

/**
 * 국세청 사업자등록 진위확인·상태조회 API.
 *
 * 국세청(hometax) 자료를 조회한다. **이 서버에서 유일하게 외부 API 를 직접 호출하는 API 다** —
 * 다른 API 는 로컬 DB 미러를 읽는다.
 *
 * 사업자번호는 경로에 담는다. '-' 는 자동으로 제거된다(`645-64-01820` = `6462401820`).
 */
@ApiTags('business')
@Auth(AuthType.Jwt, AuthType.ApiKey)
@Controller('nts/business')
export class BusinessController {
  constructor(private readonly service: BusinessService) {}

  @Get(':bno/status')
  @ApiOperation({
    summary: '사업자 등록번호 상태조회',
    description:
      '사업자번호로 납세자상태(계속/휴업/폐업)와 과세유형을 조회한다.\n\n' +
      '**등록되지 않은 번호도 에러가 아니다** — registered=false 로 응답한다.',
  })
  @ApiOkResponse({ type: BusinessStatusDto })
  async status(@Param() { bno }: BnoParamDto): Promise<BusinessStatusDto> {
    return this.service.getStatus(bno);
  }

  @Post(':bno/verify')
  @ApiOperation({
    summary: '사업자 등록정보 진위확인',
    description:
      '사업자번호(경로)·개업일자·대표자성명이 국세청 등록정보와 일치하는지 확인한다.\n' +
      '개업일자·대표자성명은 필수이고, 상호·법인번호·주소를 더 넣으면 판정이 정밀해진다.\n\n' +
      '대표자성명 등 개인정보는 URL·쿼리가 아니라 **본문**으로 받는다(접근 로그 노출 방지).',
  })
  @ApiOkResponse({ type: BusinessVerificationDto })
  async verify(
    @Param() { bno }: BnoParamDto,
    @Body() body: BusinessVerifyRequestDto,
  ): Promise<BusinessVerificationDto> {
    return this.service.verify({
      bno,
      startDate: body.startDate,
      name: body.name,
      name2: body.name2,
      companyName: body.companyName,
      corpNo: body.corpNo,
      address: body.address,
    });
  }
}
