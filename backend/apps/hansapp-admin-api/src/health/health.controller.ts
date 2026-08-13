import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiExcludeController } from '@nestjs/swagger';
import { AdminPublic } from '@hansapp/admin-application/auth';

import { buildInfo } from '../build-info';

/**
 * 살아 있는지 확인용. **인증을 걸지 않는다** — 컨테이너 헬스체크와 로드밸런서가 부른다.
 *
 * 의존 인프라 점검은 부팅 때 한 번 하고(verifyInfrastructure) 실패하면 아예 뜨지 않는다.
 * 그래서 여기서는 프로세스가 응답하는지만 본다.
 */
// 헬스체크. 모니터링이 부르는 자리라 업무 API 문서에 낄 이유가 없다.
@ApiExcludeController()
@Controller()
export class HealthController {
  @Get('health')
  @AdminPublic()
  @ApiOperation({ summary: '헬스체크' })
  health() {
    return { status: 'ok' };
  }

  @Get('version')
  @AdminPublic()
  @ApiOperation({ summary: '이 산출물의 버전·커밋' })
  version() {
    const info = buildInfo();
    return {
      version: info.version,
      sha: info.sha,
      branch: info.branch,
    };
  }
}
