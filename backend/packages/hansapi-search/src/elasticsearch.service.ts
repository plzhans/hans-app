import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Client } from '@elastic/elasticsearch';

import { SEARCH_CONFIG, SearchConfig } from './search.config';

/**
 * Elasticsearch 클라이언트 서비스.
 *
 * 접속값을 설정에서 **명시적으로 주입받는다** — process.env 를 직접 읽지 않는다(다른 계층과 같은 규칙).
 * 인증(username/password)이 없으면(로컬 무인증) auth 없이 붙는다.
 *
 * PrismaService 와 달리 OnModuleInit 에서 미리 connect 하지 않는다 — ES 클라이언트는
 * 첫 요청에 지연 연결하고, 부팅 때 ES 가 안 떠 있어도 CLI 가 뜨는 게(그래서 status/reset 을
 * 시도할 수 있는 게) 낫다. 연결 실패는 실제 명령에서 드러난다.
 */
@Injectable()
export class ElasticsearchService implements OnModuleDestroy {
  readonly client: Client;

  /** 표시용 접속 주소(비밀번호는 가린다). 로그·출력에 안전하게 쓴다. */
  readonly endpoint: string;

  constructor(@Inject(SEARCH_CONFIG) config: SearchConfig) {
    // 자격증명은 URL 에 userinfo 로 담겨 온다(DATABASE_URL 방식). 파싱해 auth 로 넘기고,
    // node 에서는 userinfo 를 지운다 — 로그·에러에 비밀번호가 섞여 나오지 않게.
    const url = new URL(config.node);
    const hasAuth = url.username !== '';
    const auth = hasAuth
      ? {
          username: decodeURIComponent(url.username),
          password: decodeURIComponent(url.password),
        }
      : undefined;

    // 표시용: 비밀번호만 가리고 user@host 는 남긴다.
    const display = new URL(config.node);
    if (display.password) {
      display.password = '***';
    }
    this.endpoint = display.toString();

    if (hasAuth) {
      url.username = '';
      url.password = '';
    }

    this.client = new Client({ node: url.toString(), auth });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.close();
  }
}
