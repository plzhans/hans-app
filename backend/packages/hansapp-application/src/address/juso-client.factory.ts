import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { JusoClient } from '@kr-go/juso';

import { SettingCache } from '../setting/setting-cache.service';

/**
 * 도로명주소 클라이언트를 만든다. **싱글턴으로 두지 않는다.**
 *
 * 이유는 NtsClientFactory 와 같다 — 만드는 비용이 없고, 부팅 때 한 번 만들어 두면 관리
 * 화면에서 승인키를 바꿔도 재시작 전까지 옛 키로 나간다. 앱마다 제 키를 쓰게 될 자리도
 * 인자로 열어 둔다.
 */
@Injectable()
export class JusoClientFactory {
  constructor(private readonly settings: SettingCache) {}

  /**
   * @param confmKey 주면 그 키로, 안 주면 서버 키(DB)로 만든다.
   * @throws ServiceUnavailableException 키가 없을 때. 부팅은 막지 않는다.
   */
  async create(confmKey?: string): Promise<JusoClient> {
    const key = confmKey ?? (await this.settings.getString(JUSO_KEY));
    if (!key) {
      throw new ServiceUnavailableException(
        'The road name address service key is not configured.',
      );
    }
    return new JusoClient({ confmKey: key });
  }
}

/**
 * 도로명주소는 **공공데이터포털과 다른 소스다.** juso.go.kr 에서 따로 받는 승인키라
 * krdata.serviceKey 와 섞으면 안 된다.
 */
const JUSO_KEY = 'juso.serviceKey';
