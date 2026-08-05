import { Module } from '@nestjs/common';

import { HealthcareMcpServer } from './healthcare-mcp.server';

/**
 * MCP 계층 DI 진입점. **설정을 받지 않는다**(forRoot 가 없다) — MCP 서버는 도구를
 * 노출할 뿐이고, 도구가 부르는 서비스는 이미 ApplicationModule 이 설정을 다 챙겼다.
 *
 * 이 모듈을 쓰려면 **ApplicationModule 을 함께 import** 해야 한다
 * (HealthcareHospitalService 등을 주입받는다). 서버 앱이 둘 다 붙인다.
 *
 * 도메인이 늘면 여기에 프로바이더 한 줄, 앱에 컨트롤러 하나가 추가된다 —
 * 서버마다 엔드포인트가 따로이므로(스펙상 서버 하나당 경로 하나) 레지스트리는 두지 않는다.
 */
@Module({
  providers: [HealthcareMcpServer],
  exports: [HealthcareMcpServer],
})
export class McpModule {}
