import { Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiController } from '@hansapp/http-common';
import { SyncStateService } from '@hansapp/admin-application';

/**
 * 공공데이터 적재 단계별 상태.
 *
 * **인증이 필요한 첫 업무 엔드포인트다.** 관리자 화면이 붙기 전까지는 "가드가 실제로
 * 막고 통과시키는지" 를 확인하는 자리이기도 하다.
 *
 * 경로가 `/api/*` 인 것은 refresh 쿠키(path=/auth)가 실리지 않게 하려는 것이다.
 */
@ApiTags('sync')
@ApiController('api/sync-state')
export class SyncStateController {
  constructor(private readonly syncState: SyncStateService) {}

  @Get()
  @ApiOperation({ summary: '적재 단계별 상태 목록' })
  list() {
    return this.syncState.list();
  }
}
