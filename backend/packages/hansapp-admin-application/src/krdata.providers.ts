import { Provider } from '@nestjs/common';
import { HiraClient } from '@krdata/hira';
import { NmcClient } from '@krdata/nmc';
import { MoisClient } from '@krdata/mois';

import { KRDATA_CONFIG, KrDataAppConfig } from './krdata.config';

export const NMC_CLIENT = Symbol('NMC_CLIENT');
export const HIRA_CLIENT = Symbol('HIRA_CLIENT');
export const MOIS_CLIENT = Symbol('MOIS_CLIENT');

/**
 * SDK 클라이언트를 설정에서 조립한다. process.env 를 직접 읽지 않는다.
 * 설정 검증은 KRDATA_CONFIG 를 만들 때 이미 끝났으므로 여기서는 값이 있다고 믿어도 된다.
 */
export const krDataProviders: Provider[] = [
  {
    provide: NMC_CLIENT,
    inject: [KRDATA_CONFIG],
    useFactory: (config: KrDataAppConfig): NmcClient => new NmcClient(config),
  },
  {
    provide: HIRA_CLIENT,
    inject: [KRDATA_CONFIG],
    useFactory: (config: KrDataAppConfig): HiraClient =>
      // 상세 서비스 경로의 버전은 키에 맞춰 갈아끼운다. 스펙은 2.8 로 고정이다.
      new HiraClient({ ...config, detailVersion: config.hiraDetailVersion }),
  },
  {
    provide: MOIS_CLIENT,
    inject: [KRDATA_CONFIG],
    // 행정안전부도 같은 포털(data.go.kr)이라 서비스키를 공유한다. 봉투만 다르고,
    // 그건 @krdata/mois 가 스스로 주입하므로 여기서 넘길 게 없다.
    useFactory: (config: KrDataAppConfig): MoisClient => new MoisClient(config),
  },
];
