import { DynamicModule, Module } from '@nestjs/common';
import { ConfigSource } from '@hansapi/common';
import { DataModule } from '@hansapi/data';

import { HospitalI18nExportService } from './hospital-i18n-export.service';

/**
 * 번역 작업의 DI 진입점.
 *
 * **AdminApplicationModule 과 따로 두는 이유는 공공데이터 서비스키다.** 그쪽은 부팅할 때
 * 서비스키를 검증하고 없으면 실패한다 — HIRA·NMC API 를 때리는 계층이라 당연하다.
 * 하지만 번역은 **DB 만 읽고 쓴다.** 원문을 뽑고 번역을 적재할 뿐 공공데이터 API 를 쓰지 않는다.
 * 같은 모듈에 얹으면 서비스키가 없는 머신에서 번역 export 조차 못 돌게 된다.
 *
 * 그래서 DataModule 만 물고 선다. 요구하는 게 적을수록 돌릴 수 있는 곳이 많다.
 */
@Module({})
export class I18nModule {
  static forRoot(source: ConfigSource): DynamicModule {
    return {
      module: I18nModule,
      imports: [DataModule.forRoot(source)],
      providers: [HospitalI18nExportService],
      exports: [HospitalI18nExportService],
    };
  }
}
