import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';
import { Public } from './auth/public.decorator';
import { buildInfo } from './build-info';
import { BuildInfoDto } from './dto/build-info.dto';

@ApiTags('app')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: '헬스 체크' })
  @ApiOkResponse({ type: String, example: 'Hello World!' })
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
