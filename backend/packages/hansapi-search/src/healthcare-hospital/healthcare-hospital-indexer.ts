import { Inject, Injectable } from '@nestjs/common';
import type { SortResults } from '@elastic/elasticsearch/lib/api/types';

import { ElasticsearchService } from '../elasticsearch.service';
import { SEARCH_CONFIG, type SearchConfig } from '../search.config';
import { HEALTHCARE_HOSPITAL_ALIAS, aliasOf } from '../schema/index';
import { HealthcareHospitalDoc } from './healthcare-hospital-doc';

/** bulk 색인 결과. 총건수는 데이터소스를 흘린 쪽(오케스트레이터)이 안다. */
export interface BulkIndexResult {
  indexed: number;
  failed: number;
}

/**
 * 병원 ES **쓰기 프리미티브**. alias 인덱스에 문서를 밀어 넣고 지우는 것만 한다 —
 * **DB 를 모른다.** 어떤 문서를 색인할지(원천 읽기·문서 조립)는 오케스트레이터(admin 계층의
 * HealthcareIndexService)가 정하고, 여기는 받은 문서를 ES 에 반영만 한다.
 *
 * 이 분리 덕에 search 패키지는 @hansapi/data(Prisma)에 의존하지 않는다 — 읽기(서버)든 쓰기(CLI)든
 * ES 클라이언트만 있으면 이 계층을 쓸 수 있다.
 *
 * 스키마 버전 교체(v1→v2)는 여기 관심사가 아니다 — 그건 SearchSchemaService 몫이고,
 * 이건 **현재 alias 가 가리키는 인덱스에 in-place** 로 반영한다.
 */
@Injectable()
export class HealthcareHospitalIndexer {
  /** 이 인덱서가 다루는 인덱스(=alias) 이름. env 접두사가 붙은 물리 alias 다. */
  readonly indexName: string;

  constructor(
    private readonly es: ElasticsearchService,
    @Inject(SEARCH_CONFIG) config: SearchConfig,
  ) {
    this.indexName = aliasOf(HEALTHCARE_HOSPITAL_ALIAS, config.env);
  }

  private get client() {
    return this.es.client;
  }

  /**
   * 문서 스트림을 target 에 bulk upsert. helpers.bulk 가 청크·백프레셔를 처리하므로
   * 오케스트레이터는 문서를 **비동기 제너레이터로 흘리기만** 하면 된다(전량을 메모리에 안 올린다).
   *
   * target 기본값은 alias 다(in-place sync). 무중단 재색인(blue-green)은 새 버전 인덱스(name-vN)를
   * **직접** 지정해 라이브 alias 를 건드리지 않고 채운 뒤, 바깥에서 alias 를 원자 스왑한다.
   */
  async bulkIndex(
    datasource: AsyncIterator<HealthcareHospitalDoc>,
    target?: string,
  ): Promise<BulkIndexResult> {
    // 기본은 alias(in-place sync). 재색인은 새 버전 인덱스를 명시적으로 넘긴다.
    const idx = target ?? this.indexName;
    // require_alias: alias 로 쓸 때만 켠다 — 오타·미존재로 맨이름 인덱스가 자동 생성되는 사고를
    // 막는다. 재색인은 실재하는 버전 인덱스를 지정하므로 이 가드가 필요 없다.
    const requireAlias = idx === this.indexName;
    const result = await this.client.helpers.bulk<HealthcareHospitalDoc>({
      datasource,
      onDocument: (doc) => ({
        index: {
          _index: idx,
          _id: String(doc.id),
          require_alias: requireAlias,
        },
      }),
      refreshOnCompletion: idx,
    });
    return { indexed: result.successful, failed: result.failed };
  }

  /** alias 인덱스의 문서를 전량 비운다(인덱스·매핑은 그대로). 삭제 건수 반환. */
  async clearData(): Promise<number> {
    const result = await this.client.deleteByQuery({
      index: this.indexName,
      query: { match_all: {} },
      refresh: true,
    });
    return Number(result.deleted ?? 0);
  }

  /** 조립된 문서 1건을 색인(upsert). 문서 조립은 오케스트레이터가 한다. */
  async indexOne(doc: HealthcareHospitalDoc): Promise<void> {
    await this.client.index({
      index: this.indexName,
      id: String(doc.id),
      document: doc,
      refresh: true,
    });
  }

  /** 병원 1건 삭제. 없어도 조용히 지나간다. */
  async deleteOne(id: number): Promise<{ deleted: boolean }> {
    const result = await this.client.delete(
      { index: this.indexName, id: String(id), refresh: true },
      { ignore: [404] },
    );
    return { deleted: result?.result === 'deleted' };
  }

  /**
   * **대사(reconcile) 삭제.** keepIds 에 없는 문서를 alias 인덱스에서 지운다 — DB 에서 사라졌거나
   * status 가 active 가 아니게 된 병원의 잔여 문서다.
   *
   * keepIds 는 8만 규모라 ES 쿼리로 못 보낸다("NOT IN 8만" 불가). 그래서 **뒤집어서** 한다:
   * ES 의 id 를 search_after 로 한 페이지씩 훑고(_source 없이 id 만), keepIds 에 없는 것만 모아
   * **명시적 _id 로** 삭제한다. keepIds 는 ES 로 나가지 않고 앱 안 필터로만 쓴다. 삭제 건수 반환.
   *
   * 전량을 먼저 스캔해 지울 목록을 확정한 뒤 삭제하므로 스캔 중 인덱스를 건드리지 않는다.
   */
  async deleteAbsent(keepIds: Set<number>): Promise<number> {
    const alias = this.indexName;
    const pageSize = 10000;
    let searchAfter: SortResults | undefined;
    const toDelete: string[] = [];

    for (;;) {
      const res = await this.client.search({
        index: alias,
        size: pageSize,
        _source: false, // 문서 본문은 안 가져온다 — _id 만 필요.
        sort: [{ id: 'asc' }], // id 는 유일 → search_after 커서가 안정적이다.
        search_after: searchAfter,
        track_total_hits: false,
      });
      const hits = res.hits.hits;
      if (hits.length === 0) {
        break;
      }
      for (const hit of hits) {
        if (hit._id !== undefined && !keepIds.has(Number(hit._id))) {
          toDelete.push(hit._id);
        }
      }
      searchAfter = hits[hits.length - 1].sort;
    }

    if (toDelete.length === 0) {
      return 0;
    }
    await this.client.helpers.bulk<string>({
      datasource: toDelete,
      onDocument: (id) => ({ delete: { _index: alias, _id: id } }),
      refreshOnCompletion: alias,
    });
    return toDelete.length;
  }
}
