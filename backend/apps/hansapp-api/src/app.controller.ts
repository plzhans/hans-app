import { Controller, Get } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';
import { Public } from './auth/public.decorator';
import { buildInfo } from './build-info';
import { BuildInfoDto } from './dto/build-info.dto';

@ApiTags('app')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /**
   * 루트. **헬스 체크가 아니다** — NestJS 기본 스캐폴딩이 남긴 자리이고, 의존성을 하나도
   * 확인하지 않은 채 고정 문자열만 돌려준다. DB 가 죽어도 이 응답은 200 이다.
   *
   * 살아 있는지 보려면 `/health`, 일할 수 있는지 보려면 `/health/ready` 를 쓴다.
   * 지우지 않는 이유는 "포트가 열려 있나" 를 눈으로 볼 자리가 하나쯤 있으면 편해서다.
   *
   * **스펙에는 싣지 않는다.** 부를 수는 있지만 알려 줄 것이 없는 index 같은 자리다.
   */
  @Get()
  @Public()
  @ApiExcludeEndpoint()
  getHello(): string {
    return this.appService.getHello();
  }

  /**
   * 떠 있는 서버가 어느 커밋인지 스스로 답한다.
   * 배포 후 "지금 뭐가 올라가 있지" 를 서버에 직접 물어볼 수 있어야 한다.
   */
  @Get('version')
  @Public()
  @ApiOperation({ summary: '빌드 버전' })
  @ApiOkResponse({ type: BuildInfoDto })
  getVersion(): BuildInfoDto {
    return buildInfo();
  }
}
