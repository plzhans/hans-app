import { DynamicModule, Module } from '@nestjs/common';

import { MEDIFINDER_CONFIG, type MedifinderConfig } from './config';
import { configureTransport } from './hansapi/transport';
import { HospitalCollectorService } from './sitemap/hospital-collector.service';
import { SitemapService } from './sitemap/sitemap.service';
import { SitemapWriterService } from './sitemap/sitemap-writer.service';
import { R2UploaderService } from './storage/r2-uploader.service';
import { WorkerDeployService } from './storage/worker-deploy.service';

/**
 * MediFinder 응용 계층의 루트 모듈.
 *
 * 부르는 쪽(medifinder-cli)이 설정을 완성해 넘긴다. DB 도, hans-api 의 설정 체계도,
 * @hansapp/* 도 쓰지 않는다 — MediFinder 는 hans-api 의 외부 소비자라 그 시스템의
 * 내부 구조에 닿으면 안 된다. 이 전제는 eslint 로도 막아 둔다(backend/eslint.config.mjs).
 *
 * API 는 공유 SDK(@hans-api/sdk)로만 부른다. medifinder-web 이 브라우저에서 쓰는 것과
 * 같은 패키지다 — 스펙이 한 번 생성되므로 프론트와 CLI 가 어긋날 자리가 없다.
 */
@Module({})
export class MedifinderApplicationModule {
  static forRoot(config: MedifinderConfig): DynamicModule {
    /*
      **HTTP 계층 설정을 여기서 한다.**

      공유 SDK 는 모듈 수준 함수로 요청을 내보내므로 주입받을 자리가 없다. 그래서 설정도
      모듈 수준에 심는다. 프로바이더가 만들어지기 전인 이 시점에 해 두면 순서를 걱정할
      일이 없다 — 어느 서비스가 먼저 생기든 첫 호출 때는 이미 채워져 있다.
    */
    configureTransport(config.api);

    return {
      module: MedifinderApplicationModule,
      providers: [
        { provide: MEDIFINDER_CONFIG, useValue: config },
        HospitalCollectorService,
        SitemapWriterService,
        SitemapService,
        R2UploaderService,
        WorkerDeployService,
      ],
      exports: [
        MEDIFINDER_CONFIG,
        SitemapService,
        SitemapWriterService,
        R2UploaderService,
        WorkerDeployService,
      ],
    };
  }
}
