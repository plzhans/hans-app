import { Body, Controller, Get, Param, Put, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { SettingAdminService } from '@hansapp/admin-application';
import { CurrentAdmin } from '@hansapp/admin-application/auth';
import type { AdminAuthUser } from '@hansapp/admin-application/auth';

import { externalBaseUrl } from '../auth/admin-social-flow';
import { SettingGroupDto, SettingSaveRequestDto } from './dto/setting.dto';

/**
 * 서비스 설정 관리.
 *
 * 설정 파일(yaml·.env) 대신 화면에서 값을 관리한다. 값은 DB 에 암호화해 담고,
 * **어떤 설정이 존재하는지는 코드(설정 카탈로그)가 소유한다** — 그래서 이 컨트롤러는
 * 설정 종류를 하나도 알지 못하고, 설정이 늘어도 여기는 그대로다.
 *
 * **쓰기 엔드포인트는 관리자 API 에만 둔다.** 서비스 API(hansapp-api)는 같은 계층을
 * 읽기용으로만 쓴다.
 */
@ApiTags('admin-setting')
@Controller('api/settings')
export class SettingController {
  constructor(private readonly settings: SettingAdminService) {}

  @Get()
  @ApiOperation({
    summary: '설정 목록',
    description:
      '카탈로그(어떤 설정이 있는지)와 현재 값을 함께 준다. secret 값은 내려보내지 않는다. ' +
      'readonly 값(리디렉션 주소)은 저장된 값이 아니라 서버가 만들어 준 것이다.',
  })
  @ApiOkResponse({ type: [SettingGroupDto] })
  async list(@Req() req: Request): Promise<SettingGroupDto[]> {
    /*
      **요청이 들어온 오리진을 같이 넘긴다.** 관리자 콘솔 로그인의 리디렉션 주소가 여기서
      만들어지는데, 소셜 로그인도 같은 값으로 redirect_uri 를 조립한다(admin-social-flow) —
      설정에 적힌 콘솔 주소를 쓰면 콘솔과 API 가 갈리는 로컬에서 엉뚱한 주소를 안내하게 된다.
    */
    const groups = await this.settings.list(externalBaseUrl(req));
    return groups.map((g) => new SettingGroupDto(g));
  }

  @Put(':groupId')
  @ApiOperation({
    summary: '설정 저장',
    description:
      '한 그룹의 값을 저장한다. 요청에 없는 키는 건드리지 않고, null 을 보내면 지운다. ' +
      '저장 즉시 캐시를 버려 다음 조회부터 새 값이 쓰인다.',
  })
  @ApiOkResponse({ type: [SettingGroupDto] })
  async save(
    @Param('groupId') groupId: string,
    @Body() dto: SettingSaveRequestDto,
    @CurrentAdmin() admin: AdminAuthUser,
    @Req() req: Request,
  ): Promise<SettingGroupDto[]> {
    // 누가 바꿨는지 남긴다 — 설정이 조용히 바뀌면 원인을 찾을 단서가 이것뿐이다.
    const groups = await this.settings.saveGroup(
      groupId,
      dto.values,
      admin.adminId,
      externalBaseUrl(req),
    );
    return groups.map((g) => new SettingGroupDto(g));
  }
}
