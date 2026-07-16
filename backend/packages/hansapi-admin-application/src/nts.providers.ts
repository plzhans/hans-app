import { Provider } from '@nestjs/common';
import { NtsClient } from '@kr-go/nts';

import { KRDATA_CONFIG, KrDataAppConfig } from './krdata.config';

export const NTS_CLIENT = Symbol('NTS_CLIENT');

/**
 * 국세청 사업자등록 SDK 클라이언트를 설정에서 조립한다. process.env 를 직접 읽지 않는다.
 *
 * **인증키를 @krdata 와 공유한다.** 국세청 진위확인·상태조회도 odcloud.kr(data.go.kr 인프라)로
 * 서비스돼 같은 serviceKey(KRDATA_SERVICE_KEY)를 쓴다. 그래서 새 설정을 만들지 않고
 * KRDATA_CONFIG 를 그대로 주입받는다. NtsConfig 가 요구하는 serviceKey·maxRetry·readTimeoutMs 가
 * KrDataAppConfig 에 모두 있으므로 그대로 넘긴다(hiraDetailVersion 은 NtsClient 가 무시한다).
 */
export const ntsProviders: Provider[] = [
  {
    provide: NTS_CLIENT,
    inject: [KRDATA_CONFIG],
    useFactory: (config: KrDataAppConfig): NtsClient => new NtsClient(config),
  },
];
