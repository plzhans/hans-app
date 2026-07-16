import { Provider } from '@nestjs/common';
import { JusoClient } from '@kr-go/juso';

import { JUSO_CONFIG, JusoAppConfig } from './juso.config';

export const JUSO_CLIENT = Symbol('JUSO_CLIENT');

/**
 * 도로명주소 SDK 클라이언트를 설정에서 조립한다. process.env 를 직접 읽지 않는다.
 * 설정 검증은 JUSO_CONFIG 를 만들 때 이미 끝났으므로 여기서는 값이 있다고 믿어도 된다.
 */
export const jusoProviders: Provider[] = [
  {
    provide: JUSO_CLIENT,
    inject: [JUSO_CONFIG],
    useFactory: (config: JusoAppConfig): JusoClient => new JusoClient(config),
  },
];
