import { Injectable } from '@nestjs/common';
import { ServiceErrorCode } from '../error';
import { NtsClient } from '@kr-go/nts';
import { UnavailableError } from '@hansapp/common';

import { SettingCache } from '../setting/setting-cache.service';

/**
 * 국세청 클라이언트를 만든다. **싱글턴으로 두지 않는다.**
 *
 * [왜 매번 만드나]
 * `NtsClient` 는 생성자가 config 를 필드에 담는 게 전부다 — 커넥션 풀도 없고 `fetch` 는
 * 전역이라 만드는 비용이 사실상 없다. 반면 부팅 때 한 번 만들어 두면 관리 화면에서 서비스키를
 * 바꿔도 재시작 전까지 옛 키로 나간다.
 *
 * [왜 키를 인자로 받나]
 * 지금은 서버 키 하나지만, 앞으로 앱마다 제 서비스키를 등록해 그 키로 호출하게 할 수 있다.
 * 그때 이 자리가 이미 열려 있으면 호출부는 인자 하나만 채우면 된다.
 *
 * **주입받는 싱글턴 클라이언트를 따로 남기지 않는 이유**가 여기 있다. 두 경로를 같이 두면,
 * 앱키가 붙는 날 싱글턴을 쓰는 자리는 여전히 서버 키로 조용히 동작한다 — 컴파일도 되고
 * 테스트도 통과하는데 그 앱의 요청이 서버 할당량을 갉아먹는다(data.go.kr 은 키 단위 일일 한도다).
 */
@Injectable()
export class NtsClientFactory {
  constructor(private readonly settings: SettingCache) {}

  /**
   * @param serviceKey 주면 그 키로, 안 주면 서버 키(DB)로 만든다.
   * @throws UnavailableError 키가 없을 때. **부팅은 막지 않는다** — 키 없이도
   *   서버는 뜨고, 이 API 를 부르는 순간에만 실패한다는 기존 방침을 그대로 지킨다.
   *
   *   서버 잘못으로 올린다(설정이 빠진 것이지 요청이 틀린 게 아니다). 그래서 "키가 없다" 는
   *   말은 응답이 아니라 로그·Sentry 로만 간다 — 우리 설정 상태를 밖에 알릴 이유가 없다.
   */
  async create(serviceKey?: string): Promise<NtsClient> {
    const key = serviceKey ?? (await this.settings.getString(NTS_KEY));
    if (!key) {
      throw new UnavailableError(ServiceErrorCode.BUSINESS_PROVIDER_UNAVAILABLE, {
        message: `The public data portal service key is not configured (${NTS_KEY}).`,
      });
    }
    return new NtsClient({ serviceKey: key });
  }
}

/**
 * 국세청은 공공데이터포털(data.go.kr) 계열이라 **서비스키를 공유한다.**
 * 심평원·국립중앙의료원·행정안전부 동기화도 같은 키를 쓴다 — 이 값을 바꾸면 그쪽도 함께 바뀐다.
 */
const NTS_KEY = 'krdata.serviceKey';
